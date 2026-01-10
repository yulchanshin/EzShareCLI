#!/usr/bin/env node
import meow from 'meow';
import { render } from 'ink';
import React from 'react';
import { Shell } from './components/Shell.js';
import { SendCommand } from './commands/send.js';
import { ReceiveCommand } from './commands/receive.js';

const cli = meow(`
  Usage
    $ hyperstream                             # Interactive shell mode
    $ hyperstream send <path>                 # Direct send
    $ hyperstream receive <key> [--output]    # Direct receive

  Examples
    $ hyperstream                             # Launch interactive shell
    $ hyperstream send ./myfile.zip           # Quick send
    $ hyperstream receive abc123... -o ./downloads

  Options
    --output, -o  Output directory for received files (default: current directory)

  Interactive Mode:
    Launch with no arguments to enter interactive shell mode.
    Use slash commands:
      /ezshare  - Start file transfer
      /help     - Show help
      /exit     - Exit shell
`, {
  importMeta: import.meta,
  flags: {
    output: { type: 'string', shortFlag: 'o' }
  }
});

const [command, arg] = cli.input;

// Interactive shell mode (no arguments)
if (!command) {
  render(<Shell />);
}
// Direct CLI mode - Send
else if (command === 'send') {
  if (!arg) {
    console.error('Error: Please specify a file or directory to send');
    console.log('Usage: hyperstream send <path>');
    process.exit(1);
  }

  render(<SendCommand path={arg} onComplete={() => process.exit(0)} onError={() => process.exit(1)} />);
}
// Direct CLI mode - Receive
else if (command === 'receive') {
  if (!arg) {
    console.error('Error: Please specify a share key');
    console.log('Usage: hyperstream receive <key> [--output <dir>]');
    process.exit(1);
  }

  const outputPath = cli.flags.output || process.cwd();
  render(<ReceiveCommand shareKey={arg} outputPath={outputPath} onComplete={() => process.exit(0)} onError={() => process.exit(1)} />);
}
else {
  cli.showHelp();
}
