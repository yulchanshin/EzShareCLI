/**
 * Compression utilities for HyperStream
 *
 * Uses zstd for streaming compression with adaptive detection
 * to skip already-compressed files.
 *
 * Stream format:
 *   [1 byte: flag] [payload...]
 *
 *   flag = 0x00: raw data (no compression applied)
 *   flag = 0x01: zstd compressed data
 *
 * The flag makes streams self-describing, allowing the receiver
 * to automatically detect and handle both cases.
 */

import { Transform, TransformCallback, Duplex } from 'node:stream';
import { extname } from 'node:path';
import { execSync } from 'node:child_process';
import { compress, decompress } from 'simple-zstd/dist/index.mjs';

// Protocol flags
const FLAG_RAW = 0x00;
const FLAG_COMPRESSED = 0x01;

// Default zstd compression level (1-22, 3 is default, good balance)
const COMPRESSION_LEVEL = 3;

/**
 * File extensions that are already compressed.
 * Compressing these again wastes CPU with minimal size benefit.
 */
const COMPRESSED_EXTENSIONS = new Set([
  // Archives
  '.zip',
  '.gz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.zst',
  '.lz4',
  '.lzma',
  '.tgz',
  '.tbz2',
  // Images
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.heic',
  '.heif',
  '.ico',
  // Video
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  '.m4v',
  '.wmv',
  '.flv',
  '.m2ts',
  // Audio
  '.mp3',
  '.aac',
  '.flac',
  '.ogg',
  '.m4a',
  '.wma',
  '.opus',
  // Documents (Office formats use ZIP internally)
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.epub',
  // Web assets
  '.woff',
  '.woff2',
  '.br', // brotli
]);

/**
 * Check if the system has zstd installed
 */
export function isZstdAvailable(): boolean {
  try {
    execSync('zstd --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file should be compressed based on its extension.
 *
 * Returns false for files that are already compressed (images, videos,
 * archives, etc.) since re-compressing them wastes CPU with minimal benefit.
 *
 * @param filePath - Path to the file (only extension is checked)
 * @returns true if the file should be compressed
 */
export function shouldCompress(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return !COMPRESSED_EXTENSIONS.has(ext);
}

/**
 * Create a transform that prepends a flag byte to the stream.
 */
function createFlagPrepender(flag: number): Transform {
  let flagSent = false;

  return new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback
    ) {
      if (!flagSent) {
        this.push(Buffer.from([flag]));
        flagSent = true;
      }
      this.push(chunk);
      callback();
    },
  });
}

/**
 * Create a compression stream.
 *
 * When compress=true:
 *   - Outputs [0x01][zstd-compressed-data]
 *   - Uses zstd for compression
 *
 * When compress=false:
 *   - Outputs [0x00][raw-data]
 *   - Simple passthrough with flag prefix
 *
 * @param shouldCompress - Whether to actually compress (default: true)
 * @returns Promise resolving to a Transform stream
 * @throws Error if zstd is not available and compression is requested
 */
export async function createCompressStream(
  shouldCompress = true
): Promise<Transform> {
  if (!shouldCompress) {
    // Simple passthrough with raw flag
    return createFlagPrepender(FLAG_RAW);
  }

  // Check zstd availability
  if (!isZstdAvailable()) {
    throw new Error(
      'zstd is not installed. Please install zstd:\n' +
        '  Ubuntu/Debian: sudo apt install zstd\n' +
        '  macOS: brew install zstd\n' +
        '  Windows: choco install zstd'
    );
  }

  // Get zstd compression stream
  const zstdStream = await compress(COMPRESSION_LEVEL);

  // Track state
  let flagSent = false;
  const pendingData: Buffer[] = [];
  let zstdFinished = false;
  let flushCallback: TransformCallback | null = null;

  // Collect compressed output from zstd
  zstdStream.on('data', (chunk: Buffer) => {
    pendingData.push(chunk);
  });

  zstdStream.on('end', () => {
    zstdFinished = true;
    if (flushCallback) {
      const cb = flushCallback;
      flushCallback = null;
      cb();
    }
  });

  zstdStream.on('error', (err: Error) => {
    if (flushCallback) {
      const cb = flushCallback;
      flushCallback = null;
      cb(err);
    }
  });

  const wrapper = new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback
    ) {
      // Write input to zstd
      zstdStream.write(chunk, (err: Error | null | undefined) => {
        if (err) {
          callback(err);
          return;
        }

        // Push any pending compressed data
        while (pendingData.length > 0) {
          const data = pendingData.shift()!;
          if (!flagSent) {
            this.push(Buffer.from([FLAG_COMPRESSED]));
            flagSent = true;
          }
          this.push(data);
        }

        callback();
      });
    },

    flush(callback: TransformCallback) {
      // End the zstd stream and wait for all data
      const pushRemaining = () => {
        while (pendingData.length > 0) {
          const data = pendingData.shift()!;
          if (!flagSent) {
            this.push(Buffer.from([FLAG_COMPRESSED]));
            flagSent = true;
          }
          this.push(data);
        }

        // Handle edge case: empty input
        if (!flagSent) {
          this.push(Buffer.from([FLAG_COMPRESSED]));
        }

        callback();
      };

      // Wait for 'end' event which fires after all 'data' events
      zstdStream.once('end', pushRemaining);
      zstdStream.end();
    },
  });

  return wrapper;
}

/**
 * Create a decompression stream.
 *
 * Automatically detects the compression format based on the first byte:
 *   - 0x00: passthrough (no decompression)
 *   - 0x01: zstd decompression
 *
 * @returns Promise resolving to a Transform stream
 */
export async function createDecompressStream(): Promise<Transform> {
  let flag: number | null = null;
  let zstdStream: Duplex | null = null;
  let buffer = Buffer.alloc(0);
  let destroyed = false;
  const pendingOutput: Buffer[] = [];

  const wrapper = new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback
    ) {
      if (destroyed) {
        return callback();
      }

      buffer = Buffer.concat([buffer, chunk]);

      // Read flag byte if not yet read
      if (flag === null) {
        if (buffer.length < 1) {
          return callback(); // Need more data
        }
        flag = buffer[0];
        buffer = buffer.subarray(1);

        // Validate flag
        if (flag !== FLAG_RAW && flag !== FLAG_COMPRESSED) {
          return callback(
            new Error(`Invalid compression flag: 0x${flag.toString(16)}`)
          );
        }

        // Initialize zstd if needed
        if (flag === FLAG_COMPRESSED) {
          if (!isZstdAvailable()) {
            return callback(
              new Error('zstd is not installed but data is compressed')
            );
          }

          // Synchronously set up - decompress() returns Promise but we handle async carefully
          decompress()
            .then((stream: Duplex) => {
              if (destroyed) {
                stream.destroy();
                return callback();
              }

              zstdStream = stream;

              // Collect decompressed output
              stream.on('data', (data: Buffer) => {
                pendingOutput.push(data);
              });

              stream.on('error', (err: Error) => {
                wrapper.destroy(err);
              });

              // Write any buffered compressed data
              if (buffer.length > 0) {
                stream.write(buffer, (err: Error | null | undefined) => {
                  buffer = Buffer.alloc(0);
                  // Push any output that arrived
                  while (pendingOutput.length > 0) {
                    this.push(pendingOutput.shift());
                  }
                  callback(err || undefined);
                });
              } else {
                callback();
              }
            })
            .catch((err: Error) => {
              callback(err);
            });

          return; // Wait for async initialization
        }
      }

      // Process buffered data
      if (buffer.length > 0) {
        if (flag === FLAG_COMPRESSED && zstdStream) {
          zstdStream.write(buffer, (err: Error | null | undefined) => {
            buffer = Buffer.alloc(0);
            // Push any output that arrived
            while (pendingOutput.length > 0) {
              this.push(pendingOutput.shift());
            }
            if (err && !destroyed) {
              callback(err);
            } else {
              callback();
            }
          });
        } else if (flag === FLAG_RAW) {
          this.push(buffer);
          buffer = Buffer.alloc(0);
          callback();
        } else {
          callback();
        }
      } else {
        // Push any pending output
        while (pendingOutput.length > 0) {
          this.push(pendingOutput.shift());
        }
        callback();
      }
    },

    flush(callback: TransformCallback) {
      if (zstdStream) {
        // Wait for 'end' event which fires after all 'data' events
        zstdStream.once('end', () => {
          // Push any remaining output
          while (pendingOutput.length > 0) {
            this.push(pendingOutput.shift());
          }
          callback();
        });
        zstdStream.end();
      } else {
        callback();
      }
    },

    destroy(err, callback) {
      destroyed = true;
      if (zstdStream) {
        zstdStream.destroy();
      }
      callback(err);
    },
  });

  return wrapper;
}
