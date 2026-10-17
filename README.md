# XR18 AI Controller

AI-powered desktop application for controlling Behringer XR18, X32, and M32 digital mixers.

## Features

- **AI Mode**: Automatically rides channel faders to prevent clipping and keep levels on target, within safety limits around where you left each fader
- **Manual Mode**: Full manual control with undo/redo (Ctrl+Z / Ctrl+Y)
- **Real-time Metering**: Live levels for every channel (~20 updates/second)
- **Alerts**: Clipping risk, sustained low signal, dead channels and sudden drops (cable pulled)
- **Desk-aware**: Moving a fader on the console makes the AI back off that channel and follow you
- **Auto-discovery**: Finds X32/X Air consoles on your networks
- **Multi-Console Support**: XR12/XR16/XR18/MR18 and X32/M32 families
- **Single installer**: No Python or other runtime to install

## Quick Start

### Prerequisites

- Node.js 22 (development only; end users just run the installer)
- A Behringer/Midas console on the same network (or use Demo mode)

### Development

```bash
npm run install:all   # root (Electron, engine) + frontend
npm run dev           # Vite + TypeScript watch + Electron window
```

### Tests

```bash
npm test              # mixer engine: OSC, meters, AI, alerts, a fake console over UDP
npm run typecheck
npm run lint --prefix frontend
```

### Building Installers

```bash
npm run build:win     # Windows (.exe, NSIS)
npm run build:mac     # macOS (.dmg)
npm run build:linux   # Linux (.AppImage)
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for architecture, the OSC details and troubleshooting.

## License

MIT
