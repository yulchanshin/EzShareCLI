# HyperStream

A decentralized, peer-to-peer file transfer CLI that works across different networks using NAT traversal. Stream files and folders securely with end-to-end encryption — no central server required.

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

## Features

- **Truly Decentralized** — Direct peer-to-peer connections via [Hyperswarm](https://github.com/holepunchto/hyperswarm) DHT
- **NAT Traversal** — Works across different networks with built-in hole-punching
- **End-to-End Encryption** — AES-256-GCM authenticated encryption
- **Adaptive Compression** — Zstandard compression with smart detection (skips already-compressed files)
- **Streaming Architecture** — Memory-efficient streaming for files of any size
- **Cross-Platform** — Works on Linux, macOS, and Windows

## Installation

### Prerequisites

- Node.js 20 or higher
- [Zstandard](https://github.com/facebook/zstd) (`zstd`) installed on your system

```bash
# Install zstd
# Ubuntu/Debian
sudo apt install zstd

# macOS
brew install zstd

# Windows (chocolatey)
choco install zstd
```

### Install HyperStream

```bash
npm install -g hyperstream
```

Or run directly with npx:

```bash
npx hyperstream send ./myfile.zip
```

## Usage

### Send a File or Directory

```bash
hyperstream send <path>
```

This generates a unique share key. Share this key with the recipient.

```
$ hyperstream send ./documents

  Share Key: BhhzKS7G4iIq4okKNYhaoqljeLMAjMR8UkpaLyqP7EA

  Waiting for peer...
```

### Receive a File

```bash
hyperstream receive <key> [--output <directory>]
```

```
$ hyperstream receive BhhzKS7G4iIq4okKNYhaoqljeLMAjMR8UkpaLyqP7EA --output ./downloads

  Connecting to peer...
  Receiving: documents (3 files, 2.4 MB)
  ████████████████████████████████████████ 100%

  Transfer complete! Saved to: ./downloads/documents
```

## How It Works

```
Sender                                              Receiver
──────                                              ────────
                    ┌─────────────────┐
[Files] ──────────► │  Tar Packing    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Zstd Compress*  │  * Skipped for .zip, .mp4, etc.
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  AES-256-GCM    │
                    │   Encryption    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Hyperswarm    │ ◄──── DHT Discovery
                    │   P2P Socket    │       NAT Hole-Punching
                    └────────┬────────┘
                             │
              ═══════════════╪═══════════════  Network
                             │
                    ┌────────▼────────┐
                    │   Hyperswarm    │
                    │   P2P Socket    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  AES-256-GCM    │
                    │   Decryption    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Zstd Decompress │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Tar Extraction │ ──────────► [Files]
                    └─────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+ with TypeScript |
| P2P Network | [Hyperswarm](https://github.com/holepunchto/hyperswarm) (DHT + NAT traversal) |
| Encryption | AES-256-GCM (Node.js crypto) |
| Compression | [Zstandard](https://github.com/facebook/zstd) via simple-zstd |
| Archiving | tar-stream (streaming tar) |
| CLI UI | [Ink](https://github.com/vadimdemedes/ink) (React for CLI) |

## Project Structure

```
hyperstream/
├── bin/
│   └── hyperstream.js      # CLI entry point
├── src/
│   ├── cli.tsx             # Main CLI application
│   ├── commands/
│   │   ├── send.tsx        # Send command UI
│   │   └── receive.tsx     # Receive command UI
│   └── utils/
│       ├── crypto.ts       # AES-256-GCM encryption streams
│       ├── compression.ts  # Zstd compression with adaptive detection
│       ├── network.ts      # Hyperswarm connection management
│       └── tar.ts          # Tar pack/extract utilities
├── package.json
└── tsconfig.json
```

## Security

- **Key Exchange**: A random 32-byte topic key is generated for each transfer and shared out-of-band
- **Key Derivation**: AES key is derived from topic using HKDF-SHA256
- **Encryption**: AES-256-GCM with unique nonces per 64KB chunk
- **Authentication**: GCM mode provides authenticated encryption (integrity + confidentiality)

The share key is the only secret. Anyone with the key can receive the file.

## Development

```bash
# Clone the repository
git clone https://github.com/yulchanshin/EzShareCLI.git
cd EzShareCLI

# Install dependencies
npm install

# Run in development mode
npm run dev -- send ./testfile.txt

# Build
npm run build

# Run tests
npx tsx src/utils/crypto.test.ts
npx tsx src/utils/compression.test.ts
```

## Roadmap

- [ ] Resume interrupted transfers
- [ ] Multiple simultaneous receivers
- [ ] Progress callbacks and ETA
- [ ] Custom encryption keys
- [ ] Web UI companion

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC License - see [LICENSE](LICENSE) for details.

---

Built with [Hyperswarm](https://github.com/holepunchto/hyperswarm) | Inspired by [Magic Wormhole](https://magic-wormhole.readthedocs.io/)
