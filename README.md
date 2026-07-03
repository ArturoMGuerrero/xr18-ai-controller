# XR18 AI Controller

AI-powered desktop application for controlling Behringer XR18, X32, and M32 digital mixers.

## Features

- **AI Mode**: Automatically adjusts channel levels to prevent clipping and maintain optimal levels
- **Manual Mode**: Full manual control of all faders and parameters
- **Real-time Metering**: Live visualization of all channel levels
- **Multi-Console Support**: Works with XR18, X32, and M32 models
- **Desktop Application**: Native Windows/Mac/Linux application with system tray support

## Quick Start

### Prerequisites

- Python 3.11 or higher
- Node.js 20 or higher
- Behringer XR18, X32, or M32 mixer on the same network

### Development Mode

```bash
# Install all dependencies
npm run install:all

# Run in development mode (opens Electron app)
npm run dev
```

### Building Installer

```bash
# Build Windows installer (.exe)
npm run build:win

# Build macOS installer (.dmg)
npm run build:mac

# Build Linux installer (.AppImage)
npm run build:linux
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for complete documentation including:
- Architecture and design
- Setup instructions
- API reference
- Development guide
- Troubleshooting

## License

MIT
