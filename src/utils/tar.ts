import { Readable, Writable } from 'node:stream';
import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import tarStream from 'tar-stream';

// Use the Header type from our declaration file
type Header = {
  name: string;
  size?: number;
  mode?: number;
  mtime?: Date;
  type?: 'file' | 'directory' | string;
};

/**
 * Transfer metadata for progress tracking
 */
export interface TransferMetadata {
  totalSize: number;
  fileCount: number;
  isDirectory: boolean;
}

/**
 * Get metadata about the transfer source (file or directory)
 * @param sourcePath - Path to file or directory
 * @returns Metadata including total size, file count, and whether it's a directory
 */
export async function getTransferMetadata(sourcePath: string): Promise<TransferMetadata> {
  const stats = await stat(sourcePath);

  if (!stats.isDirectory()) {
    // Single file
    return {
      totalSize: stats.size,
      fileCount: 1,
      isDirectory: false,
    };
  }

  // Directory - walk recursively to count files and total size
  let totalSize = 0;
  let fileCount = 0;

  async function walk(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const fileStats = await stat(fullPath);
        totalSize += fileStats.size;
        fileCount++;
      }
    }
  }

  await walk(sourcePath);

  return {
    totalSize,
    fileCount,
    isDirectory: true,
  };
}

/**
 * Create a readable stream that packs a file or directory into tar format
 * @param sourcePath - Path to file or directory to pack
 * @returns Readable stream of tar data
 */
export function createPackStream(sourcePath: string): Readable {
  const pack = tarStream.pack();

  // Start packing asynchronously
  (async () => {
    try {
      const stats = await stat(sourcePath);

      if (!stats.isDirectory()) {
        // Single file - add it directly
        const relativeName = sourcePath.split('/').pop() || 'file';
        const fileStream = createReadStream(sourcePath);

        const entry = pack.entry({
          name: relativeName,
          size: stats.size,
          mode: stats.mode,
          mtime: stats.mtime,
        });

        fileStream.pipe(entry);

        await new Promise<void>((resolve, reject) => {
          entry.on('finish', resolve);
          entry.on('error', reject);
          fileStream.on('error', reject);
        });

        pack.finalize();
        return;
      }

      // Directory - walk recursively and add all files and directories
      async function addDirectory(currentPath: string, basePath: string): Promise<void> {
        const entries = await readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(currentPath, entry.name);
          const relativePath = relative(basePath, fullPath);

          if (entry.isDirectory()) {
            // Add directory entry
            const dirStats = await stat(fullPath);

            await new Promise<void>((resolve, reject) => {
              pack.entry({
                name: relativePath + '/',
                type: 'directory',
                mode: dirStats.mode,
                mtime: dirStats.mtime,
              }, (err?: Error) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Recursively add subdirectory contents
            await addDirectory(fullPath, basePath);
          } else if (entry.isFile()) {
            // Add file entry
            const fileStats = await stat(fullPath);
            const fileStream = createReadStream(fullPath);

            const tarEntry = pack.entry({
              name: relativePath,
              size: fileStats.size,
              mode: fileStats.mode,
              mtime: fileStats.mtime,
            });

            fileStream.pipe(tarEntry);

            await new Promise<void>((resolve, reject) => {
              tarEntry.on('finish', resolve);
              tarEntry.on('error', reject);
              fileStream.on('error', reject);
            });
          }
        }
      }

      await addDirectory(sourcePath, dirname(sourcePath));
      pack.finalize();
    } catch (error) {
      pack.destroy(error as Error);
    }
  })();

  return pack;
}

/**
 * Create a writable stream that extracts tar data to a destination directory
 * @param destPath - Destination directory for extracted files
 * @returns Writable stream that accepts tar data
 */
export function createExtractStream(destPath: string): Writable {
  const extract = tarStream.extract();

  extract.on('entry', (header: Header, stream: Readable, next: (err?: Error) => void) => {
    const outputPath = join(destPath, header.name);

    // Ensure parent directory exists
    (async () => {
      try {
        const parentDir = dirname(outputPath);
        await mkdir(parentDir, { recursive: true });

        if (header.type === 'file') {
          // Write file
          const writeStream = createWriteStream(outputPath, {
            mode: header.mode,
          });

          stream.pipe(writeStream);

          await new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            stream.on('error', reject);
          });
        } else if (header.type === 'directory') {
          // Create directory
          await mkdir(outputPath, { recursive: true, mode: header.mode });
          stream.resume(); // Drain the stream
        } else {
          stream.resume(); // Skip unsupported types
        }

        next();
      } catch (error) {
        next(error as Error);
      }
    })();
  });

  return extract;
}
