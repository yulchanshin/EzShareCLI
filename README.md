# EzShare

**Secure P2P file transfer with end-to-end encryption - No servers, no signups, just share**

Share files and folders directly between peers using decentralized Hyperswarm DHT. Works across different networks with built-in NAT traversal.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## ✨ Features

- **🔒 End-to-End Encryption** — AES-256-GCM authenticated encryption
- **🌐 Truly Decentralized** — Direct peer-to-peer via Hyperswarm DHT, no servers
- **🚀 NAT Traversal** — Works across different networks with automatic hole-punching
- **⚡ Adaptive Compression** — Zstandard compression (smart detection skips .zip, .mp4, etc.)
- **💻 Interactive Shell** — Claude Code-style TUI with slash commands and file browser
- **📦 Streaming Architecture** — Memory-efficient for files of any size
- **🔄 Cross-Platform** — Linux, macOS, and Windows

## 📦 Installation

### Prerequisites

- **Node.js 18+** (recommended: Node 20+)

That's it! Zstandard compression is bundled - no system dependencies needed.

### Install Globally

```bash
npm install -g ezshare-cli
```

Now you can use `ezshare` from anywhere!

### Or Use with npx (no install)

```bash
npx ezshare-cli
```

## 🚀 Quick Start

### Interactive Mode (Recommended)

Simply type `ezshare` to launch the interactive shell:

```bash
ezshare
```

You'll see:

```
EzShare CLI - P2P File Transfer
Type /ezshare to start or /help for commands

ezshare>
```

**Available commands:**
- `/ezshare` - Open the main menu
- `/help` - Show help screen
- `/exit` - Exit the application
- `q` - Quick exit (when in command mode)
- `Esc` - Go back to command mode

#### Using the Interactive Shell

1. Type `/ezshare` to open the main menu
2. Choose **Send** or **Receive**
3. **For Send:**
   - Use arrow keys (↑/↓) to navigate your file system
   - Press `Enter` on a folder to open it
   - Press `Enter` on a file to select it for sharing
   - Copy the generated share key
4. **For Receive:**
   - Paste the share key from the sender
   - Files save to current directory by default

### Direct CLI Mode

Or use direct commands for quick transfers:

#### Send a file or directory

```bash
ezshare send <path>
```

Example:
```bash
$ ezshare send ./documents

 📤 Sending: documents
 Size: 2.4 MB | Files: 3

 Share this key with receiver:
 BhhzKS7G4iIq4okKNYhaoqljeLMAjMR8UkpaLyqP7EA

 ⠋ Waiting for peer to connect...
```

#### Receive a file

```bash
ezshare receive <share-key> [--output <directory>]
```

Example:
```bash
$ ezshare receive BhhzKS7G4iIq4okKNYhaoqljeLMAjMR8UkpaLyqP7EA

 📥 Receiving file(s)
 Size: 2.4 MB | Files: 3

 ⠋ Connecting to peer...
 ████████████████████████████████████████ 100%

 ✓ Transfer complete!
 Saved to: /current/directory
```

Specify output directory:
```bash
ezshare receive <key> --output ~/Downloads
```

## 🔧 How It Works

```
┌─────────────┐                                        ┌─────────────┐
│   Sender    │                                        │  Receiver   │
└──────┬──────┘                                        └──────┬──────┘
       │                                                      │
       │  1. Generate random topic key                       │
       │  2. Display share key to user                       │
       │                                                      │
       │  3. Announce to Hyperswarm DHT ────────────────────►│  4. Look up in DHT
       │                                                      │
       │◄─────────────────  5. P2P Connection  ──────────────┤
       │                   (NAT hole-punching)                │
       │                                                      │
       │  Files → Tar → Compress* → Encrypt (AES-256)        │
       │                                                      │
       ├──────────────────►  Transfer  ──────────────────────┤
       │                                                      │
       │                                        Decrypt → Decompress → Extract → Files
       │                                                      │
       │◄─────────────────  6. Close Connection  ────────────┤
```

*Compression is skipped for already-compressed formats (`.zip`, `.gz`, `.mp4`, `.jpg`, etc.)

## 🛡️ Security

- **Key Generation**: Random 32-byte topic key generated per transfer
- **Key Derivation**: AES key derived from topic using HKDF-SHA256
- **Encryption**: AES-256-GCM with unique nonces per 64KB chunk
- **Authentication**: GCM mode provides integrity verification
- **Transport**: Hyperswarm uses Noise protocol for transport encryption

⚠️ **Important**: The share key is the only secret. Anyone with the key can receive the file. Share it securely (Signal, encrypted email, etc.).

## 🏗️ Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ with TypeScript ES Modules |
| P2P Network | [Hyperswarm](https://github.com/holepunchto/hyperswarm) (Kademlia DHT + NAT traversal) |
| Encryption | AES-256-GCM (Node.js crypto) |
| Compression | [Zstandard](https://github.com/facebook/zstd) via @skhaz/zstd (bundled binaries) |
| Archiving | tar-stream (streaming tar) |
| TUI | [Ink](https://github.com/vadimdemedes/ink) (React for CLI) |
| CLI Parser | meow |

### Project Structure

```
ezsharecli/
├── bin/
│   └── ezshare.js          # Global CLI entry point
├── src/
│   ├── cli.tsx             # Main CLI router (interactive vs direct mode)
│   ├── components/
│   │   ├── Shell.tsx       # Interactive shell REPL
│   │   ├── MainMenu.tsx    # Send/Receive menu
│   │   ├── FileBrowser.tsx # Arrow-key file navigator
│   │   ├── HelpScreen.tsx  # Help documentation
│   │   └── TransferUI.tsx  # Transfer progress UI
│   ├── commands/
│   │   ├── send.tsx        # Send command implementation
│   │   └── receive.tsx     # Receive command implementation
│   └── utils/
│       ├── crypto.ts       # AES-256-GCM encryption/decryption streams
│       ├── compression.ts  # Zstd compression with format detection
│       ├── network.ts      # Hyperswarm connection management
│       ├── tar.ts          # Tar pack/extract utilities
│       └── fileSystem.ts   # File browser utilities
├── package.json
└── tsconfig.json
```

## 🐛 Troubleshooting

### Connection Issues

**"Connection timeout after 30s"**
- Ensure both sender and receiver are started within ~10 seconds
- Check firewall settings (Hyperswarm needs UDP for DHT)
- Try on different networks if behind restrictive NAT

**"Could not find or connect to sender"**
- Verify the share key is correct (copy-paste to avoid typos)
- Ensure sender is still running and waiting
- Both peers need internet connectivity for DHT bootstrap

### Performance Tips

- Large files (>1GB): Transfers work fine, but both peers should have stable connections
- Firewalls: Allow UDP traffic for best DHT performance
- Multiple files: Directory transfers are automatically tar-packed

## 💡 Examples

### Send a single file
```bash
ezshare send presentation.pdf
```

### Send a directory
```bash
ezshare send ./project-folder
```

### Receive to specific location
```bash
ezshare receive ABC123XYZ --output ~/Downloads
```

### Interactive mode with file browser
```bash
ezshare
# Then: /ezshare → Send → Navigate with arrows → Select file
```

## 🔮 Roadmap

- [ ] Resume interrupted transfers
- [ ] Multiple simultaneous receivers
- [ ] Transfer speed indicator and ETA
- [ ] QR code for share keys (mobile)
- [ ] Custom encryption passphrases
- [ ] Web UI companion app
- [ ] Transfer history

## 🤝 Contributing

Contributions are welcome! Here's how:

```bash
# Clone the repository
git clone https://github.com/yourusername/ezsharecli.git
cd ezsharecli

# Install dependencies
npm install

# Run in development
npm run dev

# Build
npm run build

# Run tests
npm test
```

Please open an issue before starting major features.

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built with [Hyperswarm](https://github.com/holepunchto/hyperswarm) by Holepunch
- Inspired by [Magic Wormhole](https://magic-wormhole.readthedocs.io/)
- TUI powered by [Ink](https://github.com/vadimdemedes/ink)

---

**Made with ❤️ for secure, decentralized file sharing**
