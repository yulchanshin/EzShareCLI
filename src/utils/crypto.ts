/**
 * Crypto utilities for HyperStream
 *
 * Uses AES-256-GCM with chunked encryption for true streaming support.
 * Each chunk is independently authenticated, allowing fail-fast on corruption.
 *
 * Stream format:
 *   [4 bytes: nonce prefix]     <- sent once at start
 *   [chunks...]
 *   [4 bytes: 0x00000000]       <- end marker
 *
 * Chunk format:
 *   [4 bytes: plaintext length, big-endian]
 *   [ciphertext]
 *   [16 bytes: GCM auth tag]
 *
 * Nonce construction for chunk N:
 *   [4-byte random prefix][8-byte big-endian counter N]
 *
 * This ensures unique nonces across all chunks and sessions.
 */

import { Transform, TransformCallback } from 'node:stream';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  hkdfSync,
} from 'node:crypto';

// Constants
const ALGORITHM = 'aes-256-gcm' as const;
const CHUNK_SIZE = 64 * 1024; // 64KB chunks - good balance of overhead vs latency
const NONCE_PREFIX_SIZE = 4;
const NONCE_SIZE = 12; // 4 prefix + 8 counter (standard GCM nonce)
const TAG_SIZE = 16; // GCM authentication tag
const LENGTH_SIZE = 4; // uint32 for chunk length
const KEY_SIZE = 32; // AES-256

// HKDF parameters for key derivation
const HKDF_SALT = 'hyperstream-v1';
const HKDF_INFO = 'aes-256-gcm';

/**
 * Derive AES-256 key from topic using HKDF-SHA256
 *
 * Never use the topic directly as a key - always derive through HKDF
 * for proper cryptographic key derivation with domain separation.
 */
export function deriveKey(topic: Buffer): Buffer {
  if (topic.length !== KEY_SIZE) {
    throw new Error(`Topic must be ${KEY_SIZE} bytes, got ${topic.length}`);
  }
  return Buffer.from(
    hkdfSync('sha256', topic, HKDF_SALT, HKDF_INFO, KEY_SIZE)
  );
}

/**
 * Generate a random topic key for sharing
 *
 * @returns Object with raw topic buffer and display-friendly base64url string
 */
export function generateTopicKey(): { topic: Buffer; displayKey: string } {
  const topic = randomBytes(KEY_SIZE);
  const displayKey = topic.toString('base64url');
  return { topic, displayKey };
}

/**
 * Parse a display key back to a topic buffer
 *
 * @param displayKey - base64url encoded topic key
 * @throws Error if key is invalid length
 */
export function parseTopicKey(displayKey: string): Buffer {
  const topic = Buffer.from(displayKey, 'base64url');
  if (topic.length !== KEY_SIZE) {
    throw new Error(
      `Invalid key: expected ${KEY_SIZE} bytes, got ${topic.length}`
    );
  }
  return topic;
}

/**
 * Construct nonce from prefix and counter
 */
function makeNonce(prefix: Buffer, counter: bigint): Buffer {
  const nonce = Buffer.alloc(NONCE_SIZE);
  prefix.copy(nonce, 0, 0, NONCE_PREFIX_SIZE);
  nonce.writeBigUInt64BE(counter, NONCE_PREFIX_SIZE);
  return nonce;
}

/**
 * Encrypt a single chunk with AES-256-GCM
 */
function encryptChunk(
  key: Buffer,
  noncePrefix: Buffer,
  counter: bigint,
  plaintext: Buffer
): Buffer {
  const nonce = makeNonce(noncePrefix, counter);
  const cipher = createCipheriv(ALGORITHM, key, nonce);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Output format: [length][ciphertext][tag]
  const output = Buffer.alloc(LENGTH_SIZE + ciphertext.length + TAG_SIZE);
  output.writeUInt32BE(plaintext.length, 0);
  ciphertext.copy(output, LENGTH_SIZE);
  tag.copy(output, LENGTH_SIZE + ciphertext.length);

  return output;
}

/**
 * Decrypt a single chunk with AES-256-GCM
 *
 * @throws Error if authentication fails (wrong key or corrupted data)
 */
function decryptChunk(
  key: Buffer,
  noncePrefix: Buffer,
  counter: bigint,
  ciphertext: Buffer,
  tag: Buffer
): Buffer {
  const nonce = makeNonce(noncePrefix, counter);
  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Create an encrypting transform stream
 *
 * Buffers input data and encrypts in CHUNK_SIZE chunks.
 * Outputs:
 *   1. Nonce prefix (4 bytes) - sent first
 *   2. Encrypted chunks
 *   3. End marker (4 zero bytes) - sent last
 *
 * @param key - 32-byte AES key (use deriveKey to get this from topic)
 */
export function createEncryptStream(key: Buffer): Transform {
  const noncePrefix = randomBytes(NONCE_PREFIX_SIZE);
  let counter = 0n;
  let buffer = Buffer.alloc(0);
  let headerSent = false;

  return new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback
    ) {
      try {
        // Send nonce prefix header on first data
        if (!headerSent) {
          this.push(noncePrefix);
          headerSent = true;
        }

        buffer = Buffer.concat([buffer, chunk]);

        // Process complete chunks
        while (buffer.length >= CHUNK_SIZE) {
          const plaintext = buffer.subarray(0, CHUNK_SIZE);
          buffer = buffer.subarray(CHUNK_SIZE);

          const encrypted = encryptChunk(key, noncePrefix, counter, plaintext);
          counter++;
          this.push(encrypted);
        }

        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },

    flush(callback: TransformCallback) {
      try {
        // Encrypt any remaining buffered data
        if (buffer.length > 0) {
          const encrypted = encryptChunk(key, noncePrefix, counter, buffer);
          this.push(encrypted);
        }

        // Send end marker (length = 0)
        const endMarker = Buffer.alloc(LENGTH_SIZE, 0);
        this.push(endMarker);

        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}

/**
 * Create a decrypting transform stream
 *
 * Parses and decrypts the encrypted stream format.
 * Expects:
 *   1. Nonce prefix (4 bytes)
 *   2. Encrypted chunks
 *   3. End marker (4 zero bytes)
 *
 * @param key - 32-byte AES key (use deriveKey to get this from topic)
 * @throws Propagates authentication errors if data is corrupted
 */
export function createDecryptStream(key: Buffer): Transform {
  let noncePrefix: Buffer | null = null;
  let counter = 0n;
  let buffer = Buffer.alloc(0);
  let chunkLength: number | null = null;
  let ended = false;

  return new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback
    ) {
      if (ended) {
        return callback();
      }

      buffer = Buffer.concat([buffer, chunk]);

      try {
        // Phase 1: Read nonce prefix (once)
        if (noncePrefix === null) {
          if (buffer.length < NONCE_PREFIX_SIZE) {
            return callback(); // Need more data
          }
          noncePrefix = Buffer.from(buffer.subarray(0, NONCE_PREFIX_SIZE));
          buffer = buffer.subarray(NONCE_PREFIX_SIZE);
        }

        // Phase 2: Process chunks
        while (!ended) {
          // Read chunk length if not yet known
          if (chunkLength === null) {
            if (buffer.length < LENGTH_SIZE) {
              return callback(); // Need more data
            }
            chunkLength = buffer.readUInt32BE(0);
            buffer = buffer.subarray(LENGTH_SIZE);

            // Check for end marker
            if (chunkLength === 0) {
              ended = true;
              return callback();
            }
          }

          // Wait for complete chunk (ciphertext + tag)
          const neededBytes = chunkLength + TAG_SIZE;
          if (buffer.length < neededBytes) {
            return callback(); // Need more data
          }

          // Extract ciphertext and tag
          const ciphertext = buffer.subarray(0, chunkLength);
          const tag = buffer.subarray(chunkLength, neededBytes);
          buffer = buffer.subarray(neededBytes);

          // Decrypt and output
          const plaintext = decryptChunk(
            key,
            noncePrefix,
            counter,
            ciphertext,
            tag
          );
          counter++;
          chunkLength = null;

          this.push(plaintext);
        }

        callback();
      } catch (err) {
        // Authentication failures will be caught here
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}
