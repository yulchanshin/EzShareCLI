import React from 'react';
import { Box, Text, useInput } from 'ink';

interface HelpScreenProps {
  onBack: () => void;
}

export function HelpScreen({ onBack }: HelpScreenProps) {
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        EzShare CLI - Help
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Slash Commands:</Text>
        <Text>  /ezshare  - Start interactive file transfer</Text>
        <Text>  /help     - Show this help screen</Text>
        <Text>  /exit     - Exit the shell</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Direct CLI Mode:</Text>
        <Text>  hyperstream send &lt;path&gt;              - Send file/folder</Text>
        <Text>  hyperstream receive &lt;key&gt; [-o dir]   - Receive file/folder</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Keyboard Shortcuts:</Text>
        <Text>  ↑↓        - Navigate menus/files</Text>
        <Text>  Enter     - Select/Confirm</Text>
        <Text>  Esc       - Cancel/Go back</Text>
        <Text>  q         - Quit (from command mode)</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>How It Works:</Text>
        <Text>  1. Sender selects a file/folder to share</Text>
        <Text>  2. A unique share key is generated</Text>
        <Text>  3. Receiver enters the share key</Text>
        <Text>  4. Files are transferred peer-to-peer (P2P)</Text>
        <Text>  5. Data is encrypted end-to-end with AES-256-GCM</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Press Esc or 'q' to return
        </Text>
      </Box>
    </Box>
  );
}
