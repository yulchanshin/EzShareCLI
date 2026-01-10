import React from 'react';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';

interface MainMenuProps {
  onSelect: (choice: 'send' | 'receive') => void;
}

export function MainMenu({ onSelect }: MainMenuProps) {
  return (
    <Box flexDirection="column">
      <Text>What would you like to do?</Text>
      <Box marginTop={1}>
        <Select
          options={[
            { label: '📤 Send file or folder', value: 'send' },
            { label: '📥 Receive file or folder', value: 'receive' },
          ]}
          onChange={(value) => onSelect(value as 'send' | 'receive')}
        />
      </Box>
    </Box>
  );
}
