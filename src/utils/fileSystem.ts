import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Represents a file or directory entry
 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  isHidden?: boolean;
}

/**
 * Read a directory and return sorted file entries
 * @param dirPath - Path to directory to read
 * @param showHidden - Whether to include hidden files (default: false)
 * @returns Array of file entries sorted (directories first, then alphabetically)
 */
export async function readDirectory(dirPath: string, showHidden = false): Promise<FileEntry[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const fileEntries: FileEntry[] = [];

    for (const entry of entries) {
      const name = entry.name;
      const isHidden = name.startsWith('.');

      // Skip hidden files unless showHidden is true
      if (isHidden && !showHidden) {
        continue;
      }

      const fullPath = join(dirPath, name);
      let size: number | undefined;

      // Get size for files
      if (entry.isFile()) {
        try {
          const stats = await stat(fullPath);
          size = stats.size;
        } catch {
          // If we can't stat the file, skip the size
          size = undefined;
        }
      }

      fileEntries.push({
        name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        size,
        isHidden,
      });
    }

    // Sort: directories first, then files, both alphabetically
    fileEntries.sort((a, b) => {
      // Directories come before files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      // Within same type, sort alphabetically (case-insensitive)
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    return fileEntries;
  } catch (error) {
    // If directory can't be read, return empty array
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
}

/**
 * Get information about a specific file or directory
 * @param filePath - Path to file or directory
 * @returns FileEntry with file information
 */
export async function getFileInfo(filePath: string): Promise<FileEntry> {
  const stats = await stat(filePath);
  const name = filePath.split('/').pop() || filePath;

  return {
    name,
    path: filePath,
    isDirectory: stats.isDirectory(),
    size: stats.isFile() ? stats.size : undefined,
    isHidden: name.startsWith('.'),
  };
}

/**
 * Format bytes to human-readable file size
 * @param bytes - Size in bytes
 * @returns Formatted string like "1.5 MB", "500 KB", etc.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // Limit to 2 decimal places and remove trailing zeros
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));

  return `${value} ${units[i]}`;
}
