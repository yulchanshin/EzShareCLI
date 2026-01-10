import React from 'react';
import { Box, Text } from 'ink';
import { Spinner, ProgressBar } from '@inkjs/ui';

interface TransferUIProps {
  mode: 'send' | 'receive';
  fileName?: string;
  fileSize?: number;
  progress: number;
  shareKey?: string;
}

export function TransferUI({
  mode,
  fileName,
  fileSize,
  progress,
  shareKey,
}: TransferUIProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={mode === 'send' ? 'green' : 'blue'}>
        {mode === 'send' ? '📤 Sending' : '📥 Receiving'} {fileName || 'file'}
      </Text>

      {mode === 'send' && shareKey && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">Share this key with receiver:</Text>
          <Text bold>{shareKey}</Text>
          {progress === 0 && (
            <Box marginTop={1}>
              <Spinner label="Waiting for peer to connect..." />
            </Box>
          )}
        </Box>
      )}

      {mode === 'receive' && progress === 0 && (
        <Box marginTop={1}>
          <Spinner label="Connecting to peer..." />
        </Box>
      )}

      {progress > 0 && progress < 100 && (
        <Box marginTop={1} flexDirection="column">
          <ProgressBar value={progress} />
          <Text> {progress}%</Text>
        </Box>
      )}

      {progress === 100 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green" bold>
            ✓ Transfer complete!
          </Text>
          <Text dimColor>Press Esc to return to command mode</Text>
        </Box>
      )}
    </Box>
  );
}
