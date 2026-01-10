import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { dirname } from 'node:path';
import { readDirectory, formatFileSize, type FileEntry } from '../utils/fileSystem.js';

interface FileBrowserProps {
  initialPath?: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export function FileBrowser({
  initialPath = process.cwd(),
  onSelect,
  onCancel,
}: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    try {
      const entries = await readDirectory(path);

      // Add ".." entry to go up one level (unless we're at root)
      const parentDir = dirname(path);
      if (parentDir !== path) {
        entries.unshift({
          name: '..',
          path: parentDir,
          isDirectory: true,
        });
      }

      setFiles(entries);
      setSelectedIndex(0);
    } catch (error) {
      console.error('Error loading directory:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useInput((input, key) => {
    if (loading) return; // Ignore input while loading

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(files.length - 1, prev + 1));
    } else if (key.return) {
      const selected = files[selectedIndex];
      if (selected) {
        if (selected.isDirectory) {
          // Navigate into directory
          setCurrentPath(selected.path);
        } else {
          // File selected!
          onSelect(selected.path);
        }
      }
    } else if (key.escape) {
      onCancel();
    } else if (input === 's' && selectedIndex < files.length) {
      // Quick shortcut: 's' to select current file/folder for sending
      const selected = files[selectedIndex];
      if (selected && selected.name !== '..') {
        onSelect(selected.path);
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text>Loading directory...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan">Current: {currentPath}</Text>
      <Text dimColor>↑↓ to navigate | Enter to open/select | 's' to select | Esc to cancel</Text>

      <Box flexDirection="column" marginTop={1}>
        {files.length === 0 ? (
          <Text dimColor>Empty directory</Text>
        ) : (
          files.map((file, idx) => (
            <Box key={file.path}>
              <Text color={idx === selectedIndex ? 'green' : undefined}>
                {idx === selectedIndex ? '> ' : '  '}
                {file.isDirectory ? '📁 ' : '📄 '}
                {file.name}
                {file.size !== undefined ? ` (${formatFileSize(file.size)})` : ''}
              </Text>
            </Box>
          ))
        )}
      </Box>

      {files.length > 10 && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {selectedIndex + 1} of {files.length} items
          </Text>
        </Box>
      )}
    </Box>
  );
}
