import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createPackStream, createExtractStream, getTransferMetadata } from './tar.js';
import { mkdir, writeFile, readFile, rm, readdir, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';

describe('Tar Utility', () => {
  let testDir: string;
  let outputDir: string;

  beforeEach(async () => {
    // Create temporary test directories
    testDir = join(tmpdir(), `tar-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    outputDir = join(tmpdir(), `tar-output-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directories
    await rm(testDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  describe('getTransferMetadata', () => {
    it('should get metadata for a single file', async () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      await writeFile(filePath, content);

      const metadata = await getTransferMetadata(filePath);

      assert.strictEqual(metadata.isDirectory, false);
      assert.strictEqual(metadata.fileCount, 1);
      assert.strictEqual(metadata.totalSize, content.length);
    });

    it('should get metadata for a directory with multiple files', async () => {
      // Create test files
      await writeFile(join(testDir, 'file1.txt'), 'Content 1');
      await writeFile(join(testDir, 'file2.txt'), 'Content 2 is longer');
      await mkdir(join(testDir, 'subdir'));
      await writeFile(join(testDir, 'subdir', 'file3.txt'), 'Content 3');

      const metadata = await getTransferMetadata(testDir);

      assert.strictEqual(metadata.isDirectory, true);
      assert.strictEqual(metadata.fileCount, 3);
      assert.strictEqual(metadata.totalSize, 'Content 1'.length + 'Content 2 is longer'.length + 'Content 3'.length);
    });

    it('should handle empty directory', async () => {
      const emptyDir = join(testDir, 'empty');
      await mkdir(emptyDir);

      const metadata = await getTransferMetadata(emptyDir);

      assert.strictEqual(metadata.isDirectory, true);
      assert.strictEqual(metadata.fileCount, 0);
      assert.strictEqual(metadata.totalSize, 0);
    });

    it('should handle large file sizes', async () => {
      const filePath = join(testDir, 'large.bin');
      const size = 1024 * 1024; // 1 MB
      const buffer = Buffer.alloc(size, 'x');
      await writeFile(filePath, buffer);

      const metadata = await getTransferMetadata(filePath);

      assert.strictEqual(metadata.totalSize, size);
      assert.strictEqual(metadata.fileCount, 1);
    });
  });

  describe('Pack and Extract Streams', () => {
    it('should pack and extract a single file', async () => {
      const content = 'Test file content';
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, content);

      // Pack the file
      const packStream = createPackStream(filePath);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Verify extraction
      const extractedPath = join(outputDir, 'test.txt');
      const extractedContent = await readFile(extractedPath, 'utf-8');

      assert.strictEqual(extractedContent, content);
    });

    it('should pack and extract a directory with multiple files', async () => {
      // Create test structure
      await writeFile(join(testDir, 'file1.txt'), 'File 1');
      await writeFile(join(testDir, 'file2.txt'), 'File 2');
      await mkdir(join(testDir, 'subdir'));
      await writeFile(join(testDir, 'subdir', 'file3.txt'), 'File 3');

      // Pack and extract
      const packStream = createPackStream(testDir);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Get the directory name that was packed
      const dirName = testDir.split('/').pop()!;

      // Verify all files were extracted
      const file1 = await readFile(join(outputDir, dirName, 'file1.txt'), 'utf-8');
      const file2 = await readFile(join(outputDir, dirName, 'file2.txt'), 'utf-8');
      const file3 = await readFile(join(outputDir, dirName, 'subdir', 'file3.txt'), 'utf-8');

      assert.strictEqual(file1, 'File 1');
      assert.strictEqual(file2, 'File 2');
      assert.strictEqual(file3, 'File 3');
    });

    it('should pack and extract nested directories', async () => {
      // Create nested structure
      await mkdir(join(testDir, 'level1', 'level2', 'level3'), { recursive: true });
      await writeFile(join(testDir, 'level1', 'file1.txt'), 'Level 1');
      await writeFile(join(testDir, 'level1', 'level2', 'file2.txt'), 'Level 2');
      await writeFile(join(testDir, 'level1', 'level2', 'level3', 'file3.txt'), 'Level 3');

      // Pack and extract
      const packStream = createPackStream(testDir);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Get the directory name that was packed
      const dirName = testDir.split('/').pop()!;

      // Verify nested structure
      const file1 = await readFile(join(outputDir, dirName, 'level1', 'file1.txt'), 'utf-8');
      const file2 = await readFile(join(outputDir, dirName, 'level1', 'level2', 'file2.txt'), 'utf-8');
      const file3 = await readFile(join(outputDir, dirName, 'level1', 'level2', 'level3', 'file3.txt'), 'utf-8');

      assert.strictEqual(file1, 'Level 1');
      assert.strictEqual(file2, 'Level 2');
      assert.strictEqual(file3, 'Level 3');
    });

    it('should handle binary files', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
      const filePath = join(testDir, 'binary.bin');
      await writeFile(filePath, binaryData);

      // Pack and extract
      const packStream = createPackStream(filePath);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Verify binary content
      const extractedPath = join(outputDir, 'binary.bin');
      const extractedData = await readFile(extractedPath);

      assert.deepStrictEqual(extractedData, binaryData);
    });

    it('should handle large files (1MB)', async () => {
      const size = 1024 * 1024; // 1 MB
      const largeBuffer = Buffer.alloc(size);
      // Fill with pattern for verification
      for (let i = 0; i < size; i++) {
        largeBuffer[i] = i % 256;
      }

      const filePath = join(testDir, 'large.bin');
      await writeFile(filePath, largeBuffer);

      // Pack and extract
      const packStream = createPackStream(filePath);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Verify content
      const extractedPath = join(outputDir, 'large.bin');
      const extractedBuffer = await readFile(extractedPath);

      assert.strictEqual(extractedBuffer.length, size);
      assert.deepStrictEqual(extractedBuffer, largeBuffer);
    });

    it('should preserve file permissions', async () => {
      const filePath = join(testDir, 'executable.sh');
      await writeFile(filePath, '#!/bin/bash\necho "test"');
      await chmod(filePath, 0o755); // Make executable

      // Pack and extract
      const packStream = createPackStream(filePath);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Verify permissions
      const extractedPath = join(outputDir, 'executable.sh');
      const stats = await stat(extractedPath);
      const mode = stats.mode & 0o777;

      assert.strictEqual(mode, 0o755);
    });

    it('should handle empty directory', async () => {
      const emptyDir = join(testDir, 'empty');
      await mkdir(emptyDir);

      // Pack and extract
      const packStream = createPackStream(testDir);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Get the directory name that was packed
      const dirName = testDir.split('/').pop()!;

      // Directory should be created (even if empty)
      const entries = await readdir(join(outputDir, dirName));
      assert.ok(entries.length >= 0); // Directory exists
    });

    it('should handle files with special characters in names', async () => {
      const specialName = 'file with spaces & special-chars_123.txt';
      const filePath = join(testDir, specialName);
      await writeFile(filePath, 'Special content');

      // Pack and extract
      const packStream = createPackStream(filePath);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Verify
      const extractedPath = join(outputDir, specialName);
      const content = await readFile(extractedPath, 'utf-8');

      assert.strictEqual(content, 'Special content');
    });

    it('should handle multiple small files efficiently', async () => {
      // Create 100 small files
      for (let i = 0; i < 100; i++) {
        await writeFile(join(testDir, `file${i}.txt`), `Content ${i}`);
      }

      // Pack and extract
      const packStream = createPackStream(testDir);
      const extractStream = createExtractStream(outputDir);

      await pipeline(packStream, extractStream);

      // Get the directory name that was packed
      const dirName = testDir.split('/').pop()!;

      // Verify all files exist
      const entries = await readdir(join(outputDir, dirName));
      assert.strictEqual(entries.length, 100);

      // Spot check a few files
      const file0 = await readFile(join(outputDir, dirName, 'file0.txt'), 'utf-8');
      const file50 = await readFile(join(outputDir, dirName, 'file50.txt'), 'utf-8');
      const file99 = await readFile(join(outputDir, dirName, 'file99.txt'), 'utf-8');

      assert.strictEqual(file0, 'Content 0');
      assert.strictEqual(file50, 'Content 50');
      assert.strictEqual(file99, 'Content 99');
    });
  });
});
