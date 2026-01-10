/**
 * Quick test for crypto utilities
 * Run with: npx tsx src/utils/crypto.test.ts
 */

import { pipeline } from 'node:stream/promises';
import { Readable, Writable } from 'node:stream';
import {
  generateTopicKey,
  parseTopicKey,
  deriveKey,
  createEncryptStream,
  createDecryptStream,
} from './crypto.js';

async function test() {
  console.log('Testing crypto utilities...\n');

  // Test 1: Key generation and parsing
  console.log('Test 1: Key generation and parsing');
  const { topic, displayKey } = generateTopicKey();
  console.log(`  Generated key: ${displayKey}`);
  console.log(`  Key length: ${displayKey.length} chars`);

  const parsedTopic = parseTopicKey(displayKey);
  const match = Buffer.compare(topic, parsedTopic) === 0;
  console.log(`  Roundtrip: ${match ? 'PASS' : 'FAIL'}\n`);

  // Test 2: Key derivation
  console.log('Test 2: Key derivation');
  const key1 = deriveKey(topic);
  const key2 = deriveKey(topic);
  const keysMatch = Buffer.compare(key1, key2) === 0;
  console.log(`  Key size: ${key1.length} bytes`);
  console.log(`  Deterministic: ${keysMatch ? 'PASS' : 'FAIL'}\n`);

  // Test 3: Encrypt/Decrypt roundtrip with small data
  console.log('Test 3: Small data roundtrip');
  const smallData = Buffer.from('Hello, HyperStream!');
  const smallResult = await encryptDecryptRoundtrip(key1, smallData);
  const smallMatch = Buffer.compare(smallData, smallResult) === 0;
  console.log(`  Input: "${smallData.toString()}"`);
  console.log(`  Output: "${smallResult.toString()}"`);
  console.log(`  Match: ${smallMatch ? 'PASS' : 'FAIL'}\n`);

  // Test 4: Encrypt/Decrypt roundtrip with large data (multiple chunks)
  console.log('Test 4: Large data roundtrip (200KB = ~3 chunks)');
  const largeData = Buffer.alloc(200 * 1024);
  for (let i = 0; i < largeData.length; i++) {
    largeData[i] = i % 256;
  }
  const largeResult = await encryptDecryptRoundtrip(key1, largeData);
  const largeMatch = Buffer.compare(largeData, largeResult) === 0;
  console.log(`  Input size: ${largeData.length} bytes`);
  console.log(`  Output size: ${largeResult.length} bytes`);
  console.log(`  Match: ${largeMatch ? 'PASS' : 'FAIL'}\n`);

  // Test 5: Wrong key should fail
  console.log('Test 5: Wrong key detection');
  const wrongKey = deriveKey(generateTopicKey().topic);
  try {
    await encryptDecryptRoundtrip(key1, smallData, wrongKey);
    console.log('  Expected error but got success: FAIL\n');
  } catch (err) {
    console.log(`  Correctly rejected: PASS\n`);
  }

  console.log('All tests completed!');
}

async function encryptDecryptRoundtrip(
  encryptKey: Buffer,
  data: Buffer,
  decryptKey?: Buffer
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  // Create readable stream from data
  const input = Readable.from([data]);

  // Create writable stream to collect output
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  // Run pipeline
  await pipeline(
    input,
    createEncryptStream(encryptKey),
    createDecryptStream(decryptKey ?? encryptKey),
    output
  );

  return Buffer.concat(chunks);
}

test().catch(console.error);
