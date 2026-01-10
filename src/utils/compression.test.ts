/**
 * Tests for compression utilities
 * Run with: npx tsx src/utils/compression.test.ts
 */

import { pipeline } from 'node:stream/promises';
import { Readable, Writable } from 'node:stream';
import {
  shouldCompress,
  isZstdAvailable,
  createCompressStream,
  createDecompressStream,
} from './compression.js';

// Test results tracking
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('Testing compression utilities...\n');

  // Test 1: shouldCompress function
  console.log('Test 1: shouldCompress()');

  // Files that SHOULD be compressed
  assert(shouldCompress('file.txt') === true, 'text files should compress');
  assert(shouldCompress('data.json') === true, 'json files should compress');
  assert(shouldCompress('script.js') === true, 'js files should compress');
  assert(shouldCompress('style.css') === true, 'css files should compress');
  assert(shouldCompress('document.html') === true, 'html files should compress');
  assert(shouldCompress('data.xml') === true, 'xml files should compress');
  assert(shouldCompress('README.md') === true, 'markdown files should compress');
  assert(shouldCompress('binary.bin') === true, 'unknown files should compress');

  // Files that should NOT be compressed (already compressed)
  assert(shouldCompress('archive.zip') === false, 'zip files should not compress');
  assert(shouldCompress('archive.gz') === false, 'gz files should not compress');
  assert(shouldCompress('archive.7z') === false, '7z files should not compress');
  assert(shouldCompress('image.jpg') === false, 'jpg files should not compress');
  assert(shouldCompress('image.png') === false, 'png files should not compress');
  assert(shouldCompress('video.mp4') === false, 'mp4 files should not compress');
  assert(shouldCompress('audio.mp3') === false, 'mp3 files should not compress');
  assert(shouldCompress('document.pdf') === false, 'pdf files should not compress');
  assert(shouldCompress('document.docx') === false, 'docx files should not compress');

  // Case insensitivity
  assert(shouldCompress('IMAGE.JPG') === false, 'extension check is case insensitive');
  assert(shouldCompress('ARCHIVE.ZIP') === false, 'extension check is case insensitive (zip)');

  console.log('');

  // Test 2: isZstdAvailable
  console.log('Test 2: isZstdAvailable()');
  const zstdAvailable = isZstdAvailable();
  console.log(`  zstd available: ${zstdAvailable}`);

  if (!zstdAvailable) {
    console.log('\n⚠️  zstd is not installed. Skipping compression stream tests.');
    console.log('  Install zstd to run full tests:');
    console.log('    Ubuntu/Debian: sudo apt install zstd');
    console.log('    macOS: brew install zstd');
    printSummary();
    return;
  }

  console.log('');

  // Test 3: Compression roundtrip (compress=true)
  console.log('Test 3: Compress/decompress roundtrip (with compression)');
  const testData1 = Buffer.from('Hello, HyperStream! This is a test of the compression system.');
  const result1 = await compressDecompressRoundtrip(testData1, true);
  assert(
    Buffer.compare(testData1, result1) === 0,
    'data matches after compress/decompress'
  );
  console.log('');

  // Test 4: Passthrough roundtrip (compress=false)
  console.log('Test 4: Compress/decompress roundtrip (without compression)');
  const testData2 = Buffer.from('This data should pass through without compression.');
  const result2 = await compressDecompressRoundtrip(testData2, false);
  assert(
    Buffer.compare(testData2, result2) === 0,
    'data matches after passthrough'
  );
  console.log('');

  // Test 5: Large data (multiple chunks)
  console.log('Test 5: Large data roundtrip (500KB)');
  const largeData = Buffer.alloc(500 * 1024);
  for (let i = 0; i < largeData.length; i++) {
    largeData[i] = i % 256;
  }
  const largeResult = await compressDecompressRoundtrip(largeData, true);
  assert(
    Buffer.compare(largeData, largeResult) === 0,
    'large data matches after roundtrip'
  );
  console.log(`  Input size: ${largeData.length} bytes`);
  console.log('');

  // Test 6: Verify flag byte
  console.log('Test 6: Flag byte verification');
  const flagTestData = Buffer.from('Test');

  // Compressed should start with 0x01
  const compressedStream = await createCompressStream(true);
  const compressedChunks: Buffer[] = [];
  await pipeline(
    Readable.from([flagTestData]),
    compressedStream,
    new Writable({
      write(chunk, _, cb) {
        compressedChunks.push(chunk);
        cb();
      },
    })
  );
  const compressedOutput = Buffer.concat(compressedChunks);
  assert(compressedOutput[0] === 0x01, 'compressed stream starts with 0x01');

  // Passthrough should start with 0x00
  const passthroughStream = await createCompressStream(false);
  const passthroughChunks: Buffer[] = [];
  await pipeline(
    Readable.from([flagTestData]),
    passthroughStream,
    new Writable({
      write(chunk, _, cb) {
        passthroughChunks.push(chunk);
        cb();
      },
    })
  );
  const passthroughOutput = Buffer.concat(passthroughChunks);
  assert(passthroughOutput[0] === 0x00, 'passthrough stream starts with 0x00');
  assert(
    Buffer.compare(passthroughOutput.subarray(1), flagTestData) === 0,
    'passthrough data is unchanged after flag'
  );
  console.log('');

  // Test 7: Compression ratio check
  console.log('Test 7: Compression effectiveness');
  const repeatableData = Buffer.from('AAAAAAAAAA'.repeat(1000)); // Highly compressible
  const compressStream = await createCompressStream(true);
  const compressedChunks2: Buffer[] = [];
  await pipeline(
    Readable.from([repeatableData]),
    compressStream,
    new Writable({
      write(chunk, _, cb) {
        compressedChunks2.push(chunk);
        cb();
      },
    })
  );
  const compressedSize = Buffer.concat(compressedChunks2).length;
  const ratio = compressedSize / repeatableData.length;
  console.log(`  Original: ${repeatableData.length} bytes`);
  console.log(`  Compressed: ${compressedSize} bytes`);
  console.log(`  Ratio: ${(ratio * 100).toFixed(1)}%`);
  assert(ratio < 0.1, 'highly compressible data achieves good compression');
  console.log('');

  // Test 8: Error handling for invalid flag
  console.log('Test 8: Invalid flag detection');
  try {
    const invalidData = Buffer.from([0x99, 0x01, 0x02, 0x03]); // Invalid flag 0x99
    const decompStream = await createDecompressStream();
    await pipeline(
      Readable.from([invalidData]),
      decompStream,
      new Writable({ write(_, __, cb) { cb(); } })
    );
    assert(false, 'should have thrown error for invalid flag');
  } catch (err) {
    assert(
      err instanceof Error && err.message.includes('Invalid compression flag'),
      'correctly rejects invalid flag'
    );
  }

  printSummary();
}

async function compressDecompressRoundtrip(
  data: Buffer,
  compress: boolean
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  const compressStream = await createCompressStream(compress);
  const decompressStream = await createDecompressStream();

  await pipeline(
    Readable.from([data]),
    compressStream,
    decompressStream,
    new Writable({
      write(chunk, _, callback) {
        chunks.push(chunk);
        callback();
      },
    })
  );

  return Buffer.concat(chunks);
}

function printSummary() {
  console.log('─'.repeat(40));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
