import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import { HelpScreen } from './HelpScreen.js';
import { MainMenu } from './MainMenu.js';
import { FileBrowser } from './FileBrowser.js';
import { SendCommand } from '../commands/send.js';
import { ReceiveCommand } from '../commands/receive.js';

type ShellMode =
  | 'command'      // Waiting for slash command input
  | 'main-menu'    // Show send/receive choice
  | 'file-browser' // Navigate files with arrow keys
  | 'receive-key'  // Ask for share key input
  | 'transfer'     // Show progress during send/receive
  | 'help'         // Display help screen
  | 'done';        // Transfer complete, return to command

interface ShellState {
  mode: ShellMode;
  selectedPath?: string;
  transferKey?: string;
  transferProgress?: number;
  transferMode?: 'send' | 'receive';
  fileName?: string;
  history: string[];
}

export function Shell() {
  const [state, setState] = useState<ShellState>({
    mode: 'command',
    history: [],
  });

  const handleCommand = (cmd: string) => {
    const trimmed = cmd.trim();

    // Add to history
    setState((prev) => ({
      ...prev,
      history: [...prev.history, trimmed],
    }));

    // Process slash commands
    if (trimmed === '/ezshare') {
      setState((prev) => ({ ...prev, mode: 'main-menu' }));
    } else if (trimmed === '/help') {
      setState((prev) => ({ ...prev, mode: 'help' }));
    } else if (trimmed === '/exit') {
      process.exit(0);
    } else if (trimmed.startsWith('/')) {
      // Unknown command
      setState((prev) => ({
        ...prev,
        history: [...prev.history, `Unknown command: ${trimmed}`],
      }));
    }
  };

  const handleMenuSelect = (choice: 'send' | 'receive') => {
    if (choice === 'send') {
      setState((prev) => ({ ...prev, mode: 'file-browser', transferMode: 'send' }));
    } else {
      setState((prev) => ({ ...prev, mode: 'receive-key', transferMode: 'receive' }));
    }
  };

  const handleFileSelect = (path: string) => {
    setState((prev) => ({
      ...prev,
      mode: 'transfer',
      selectedPath: path,
    }));
  };

  const handleKeyInput = (key: string) => {
    setState((prev) => ({
      ...prev,
      mode: 'transfer',
      transferKey: key,
    }));
  };

  const handleTransferComplete = () => {
    setState((prev) => ({ ...prev, mode: 'done' }));
  };

  const handleTransferError = (error: Error) => {
    console.error('Transfer error:', error);
    setState((prev) => ({ ...prev, mode: 'done' }));
  };

  const handleCancel = () => {
    setState((prev) => ({ ...prev, mode: 'command' }));
  };

  const handleHelpBack = () => {
    setState((prev) => ({ ...prev, mode: 'command' }));
  };

  // Global keyboard shortcuts
  useInput((input, key) => {
    if (input === 'q' && state.mode === 'command') {
      process.exit(0);
    }
    if (key.escape && state.mode !== 'transfer') {
      setState((prev) => ({ ...prev, mode: 'command' }));
    }
    if (key.escape && state.mode === 'done') {
      setState((prev) => ({ ...prev, mode: 'command' }));
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        EzShare CLI - P2P File Transfer
      </Text>
      <Text dimColor>Type /ezshare to start or /help for commands</Text>

      <Box marginTop={1} flexDirection="column">
        {state.mode === 'command' && (
          <TextInput
            placeholder="Enter command..."
            onSubmit={handleCommand}
          />
        )}

        {state.mode === 'main-menu' && <MainMenu onSelect={handleMenuSelect} />}

        {state.mode === 'file-browser' && (
          <FileBrowser onSelect={handleFileSelect} onCancel={handleCancel} />
        )}

        {state.mode === 'receive-key' && (
          <Box flexDirection="column">
            <Text>Paste the share key you received:</Text>
            <TextInput
              placeholder="Enter share key..."
              onSubmit={handleKeyInput}
            />
            <Box marginTop={1}>
              <Text dimColor>Press Esc to cancel</Text>
            </Box>
          </Box>
        )}

        {state.mode === 'transfer' && state.transferMode === 'send' && state.selectedPath && (
          <SendCommand
            path={state.selectedPath}
            onComplete={handleTransferComplete}
            onError={handleTransferError}
          />
        )}

        {state.mode === 'transfer' && state.transferMode === 'receive' && state.transferKey && (
          <ReceiveCommand
            shareKey={state.transferKey}
            onComplete={handleTransferComplete}
            onError={handleTransferError}
          />
        )}

        {state.mode === 'done' && (
          <Box flexDirection="column">
            <Text color="green" bold>
              ✓ Transfer complete!
            </Text>
            <Box marginTop={1}>
              <Text dimColor>Press Esc to return to command mode</Text>
            </Box>
          </Box>
        )}

        {state.mode === 'help' && <HelpScreen onBack={handleHelpBack} />}
      </Box>

      {state.history.length > 0 && state.mode === 'command' && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Recent commands:</Text>
          {state.history.slice(-3).map((cmd, idx) => (
            <Text key={`cmd-${idx}-${cmd}`} dimColor>
              {'  '}{cmd}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
