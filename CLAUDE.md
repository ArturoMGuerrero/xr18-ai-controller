# XR18 AI Controller - Instructions

Desktop application with AI-powered automatic level control for Behringer XR18, X32, and M32 digital mixing consoles.

**Last Updated:** 2026-07-03  
**Author:** Jorge Moreno  
**Version:** 1.0.0

---

## Table of Contents

- [Project Overview](#project-overview)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Development Setup](#development-setup)
- [Key Features](#key-features)
- [Architecture & Design Patterns](#architecture--design-patterns)
- [API Documentation](#api-documentation)
- [Development Commands](#development-commands)
- [Configuration](#configuration)
- [Testing](#testing)
- [Building & Deployment](#building--deployment)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)

---

## Project Overview

XR18 AI Controller is a desktop application that provides intelligent, AI-powered control for Behringer digital mixing consoles. It monitors audio levels in real-time and can automatically adjust faders to prevent clipping while maintaining optimal signal levels.

### Key Capabilities

- **AI Mode**: Automatically adjusts levels based on statistical analysis and pattern recognition
- **Manual Mode**: Full manual control with real-time metering
- **Multi-Console**: Supports XR18 (16 channels), X32/M32 (32 channels)
- **Cross-Platform**: Windows, macOS, Linux desktop application
- **Real-time**: 50ms refresh rate for meters and adjustments

### Use Cases

1. Live sound reinforcement with automatic gain management
2. Recording sessions with consistent level monitoring
3. Broadcast applications requiring constant levels
4. Protection against sudden level spikes and clipping

---

## Project Structure

```
xr18-ai-controller/
├── backend/                          # Python FastAPI backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI application
│   │   ├── config.py                 # Configuration settings
│   │   ├── ai_controller.py          # AI level analysis logic
│   │   └── adapters/                 # Mixer protocol adapters
│   │       ├── __init__.py
│   │       ├── base_adapter.py       # Abstract base adapter
│   │       └── behringer_adapter.py  # XR18/X32/M32 implementation
│   ├── tests/                        # Backend tests
│   └── requirements.txt              # Python dependencies
│
├── frontend/                         # React + TypeScript frontend
│   ├── src/
│   │   ├── components/               # React components
│   │   │   ├── ChannelStrip.tsx      # Individual channel control
│   │   │   ├── MeterBar.tsx          # Level meter visualization
│   │   │   ├── ConnectionPanel.tsx   # Mixer connection UI
│   │   │   └── ModeControl.tsx       # AI/Manual mode toggle
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts       # WebSocket connection hook
│   │   ├── services/
│   │   │   └── api.ts                # API client
│   │   ├── types/
│   │   │   └── index.ts              # TypeScript types
│   │   ├── styles/
│   │   │   └── index.css             # Global styles
│   │   ├── App.tsx                   # Main application
│   │   └── main.tsx                  # Entry point
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts                # Vite configuration
│   ├── tsconfig.json                 # TypeScript configuration
│   ├── tailwind.config.js            # Tailwind CSS configuration
│   └── postcss.config.js
│
├── electron/                         # Electron wrapper
│   ├── main.js                       # Electron main process
│   └── preload.js                    # Preload script
│
├── installer/                        # Build resources
│   └── icon.ico                      # Application icon
│
├── .github/
│   └── workflows/                    # CI/CD pipelines
│
├── package.json                      # Root package.json
├── .gitignore
├── README.md
└── CLAUDE.md                         # This file
```

---

## Technology Stack

### Backend

- **Python 3.11+**
  - FastAPI (web framework)
  - Uvicorn (ASGI server)
  - python-osc (OSC protocol implementation)
  - NumPy (statistical analysis)
  - Pydantic (data validation)

### Frontend

- **React 18**
  - TypeScript (strict mode)
  - Vite (build tool)
  - Tailwind CSS (styling)
  - Recharts (data visualization - optional)

### Desktop

- **Electron 28**
  - System tray integration
  - Auto-start capability
  - Native window management

### Protocols

- **OSC (Open Sound Control)** over UDP
  - XR18: Port 10024
  - X32/M32: Port 10023

---

## Development Setup

### Prerequisites

1. **Python 3.11+**
   ```bash
   python --version
   ```

2. **Node.js 20+**
   ```bash
   node --version
   npm --version
   ```

3. **Mixer on Network**
   - Behringer XR18, X32, or M32
   - Connected to same network as development machine
   - Note the mixer's IP address

### Installation

```bash
# Clone repository
cd "C:\Users\jmoreno2\OneDrive - AutoZone Parts, Inc\Documents\GitHub"
cd xr18-ai-controller

# Install all dependencies (backend + frontend + electron)
npm run install:all

# Or install separately:
npm run backend:install    # Install Python dependencies
npm run frontend:install   # Install frontend dependencies
npm install                # Install Electron dependencies
```

### Running in Development Mode

```bash
# Start all services (backend + frontend + electron)
npm run dev

# Or run separately in different terminals:

# Terminal 1: Backend (FastAPI)
npm run backend:dev
# Server runs on http://localhost:8000

# Terminal 2: Frontend (Vite)
npm run frontend:dev
# Dev server runs on http://localhost:5173

# Terminal 3: Electron
npm run electron:dev
```

The Electron window will open automatically and connect to both the backend API and frontend dev server.

---

## Key Features

### 1. AI-Powered Level Control

The AI controller uses statistical analysis to make intelligent decisions about level adjustments:

- **Peak Detection**: Monitors for levels approaching 0dB (clipping risk)
- **Average Analysis**: Tracks average levels over time
- **Dynamic Response**: Adjusts to signal variability (music vs. speech)
- **Headroom Management**: Maintains safe headroom to prevent distortion
- **Confidence Scoring**: Only acts when confidence threshold is met

**AI Algorithm:**
```python
# Key metrics analyzed:
- Recent peak levels (last 10 samples)
- Average level (100-sample window)
- Standard deviation (signal dynamics)
- Clipping risk (levels > -3dB)

# Actions taken:
- CRITICAL: Immediate reduction if peak > -3dB
- HIGH: Reduce if exceeding max threshold
- MEDIUM: Proactive reduction if low headroom with dynamic signal
- LOW: Gentle increase if consistently too low
```

### 2. Multi-Console Support

Modular adapter architecture allows support for different console models:

**Current Support:**
- ✅ Behringer XR18 (16 channels, 6 buses)
- ✅ Behringer X32 (32 channels, 16 buses)
- ✅ Midas M32 (32 channels, 16 buses)

**Future Support (architecture ready):**
- 🔲 Yamaha CL/QL series
- 🔲 Allen & Heath SQ series
- 🔲 Soundcraft Ui series

### 3. Real-Time Metering

- 50ms refresh rate (20 updates/second)
- Color-coded meter bars:
  - Green: Safe levels (-60dB to -12dB)
  - Yellow: Hot levels (-12dB to -6dB)
  - Orange: Warning levels (-6dB to -3dB)
  - Red: Danger zone (-3dB to 0dB)
- Peak indicators for transient detection
- Statistical overlays (average, peak, standard deviation)

### 4. Dual Control Modes

**Manual Mode:**
- Full control of all faders
- Real-time meter feedback
- Mute/unmute channels
- No AI intervention

**AI Mode:**
- Automatic level adjustments
- Manual control disabled (safety)
- Visual feedback of AI decisions
- Urgency-based color coding
- Confidence indicators

---

## Architecture & Design Patterns

### Overall Architecture

```
┌─────────────────────────────────────────────────┐
│         Electron (Desktop Shell)                │
│  - Window management                            │
│  - System tray                                  │
│  - Python process lifecycle                     │
└─────────────────────────────────────────────────┘
         ↓                          ↓
┌──────────────────┐      ┌──────────────────────┐
│  React Frontend  │◄────►│  FastAPI Backend     │
│  (Port 5173)     │ HTTP │  (Port 8000)         │
│                  │ WS   │                      │
│  - UI Components │      │  - OSC Client        │
│  - Real-time     │      │  - AI Controller     │
│    updates       │      │  - Mixer Adapters    │
└──────────────────┘      └──────────────────────┘
                                   ↓ OSC (UDP)
                          ┌──────────────────────┐
                          │  Behringer Mixer     │
                          │  XR18 / X32 / M32    │
                          └──────────────────────┘
```

### Design Patterns

#### 1. Adapter Pattern (Mixer Support)

**Purpose:** Abstract different mixer protocols behind common interface

```python
# Base interface
class MixerAdapter(ABC):
    @abstractmethod
    async def connect(self, ip: str, port: int) -> bool
    @abstractmethod
    async def set_channel_fader(self, channel: int, value: float) -> bool
    # ... more methods

# Concrete implementations
class BehringerAdapter(MixerAdapter):
    # Implements OSC protocol for Behringer consoles
    
class YamahaAdapter(MixerAdapter):  # Future
    # Would implement Yamaha's OSC variant
```

**Benefits:**
- Easy to add new console brands
- Same AI logic works with all adapters
- Single frontend for all consoles

#### 2. Observer Pattern (Real-time Updates)

**Purpose:** Push meter updates to frontend without polling

```python
# Backend: WebSocket broadcasts
async def websocket_meters(websocket: WebSocket):
    while True:
        channels = await mixer_adapter.get_all_channels()
        await websocket.send_json({"channels": channels})
        await asyncio.sleep(0.05)  # 50ms

# Frontend: Hook subscribes to updates
const { meterData } = useWebSocket();
```

#### 3. Strategy Pattern (AI vs Manual)

**Purpose:** Switch between control strategies at runtime

```python
if ai_enabled:
    decision = ai_controller.analyze_level(channel, level)
    if decision.action != 'maintain':
        await mixer_adapter.set_channel_fader(channel, decision.suggested_fader)
else:
    # Manual mode - user controls faders directly
```

### Communication Flow

**1. Meter Updates (50ms cycle):**
```
Mixer → OSC meters → BehringerAdapter → FastAPI → WebSocket → React UI
```

**2. Manual Fader Change:**
```
React UI → API POST → FastAPI → BehringerAdapter → OSC command → Mixer
```

**3. AI Adjustment:**
```
Mixer → meters → AI analysis → decision → OSC command → Mixer
                                  ↓
                            WebSocket → React (notification)
```

---

## API Documentation

### REST Endpoints

#### POST /api/mixer/connect
Connect to mixer console.

**Request:**
```json
{
  "mixer_model": "xr18",  // or "x32", "m32"
  "ip_address": "192.168.1.1",
  "port": 10024  // optional, defaults based on model
}
```

**Response:**
```json
{
  "status": "connected",
  "mixer_info": {
    "name": "Behringer XR18",
    "model": "XR18",
    "ip": "192.168.1.1",
    "port": 10024,
    "channels": 16,
    "buses": 6
  }
}
```

#### POST /api/mixer/disconnect
Disconnect from mixer.

**Response:**
```json
{
  "status": "disconnected"
}
```

#### POST /api/mode/set
Set AI or manual mode.

**Request:**
```json
{
  "ai_enabled": true
}
```

**Response:**
```json
{
  "ai_enabled": true,
  "message": "AI mode enabled"
}
```

#### POST /api/channel/fader
Set channel fader (manual mode only).

**Request:**
```json
{
  "channel": 1,
  "value": 0.75  // 0.0 - 1.0
}
```

**Response:**
```json
{
  "status": "success",
  "channel": 1,
  "value": 0.75
}
```

#### POST /api/channel/mute
Mute or unmute channel.

**Request:**
```json
{
  "channel": 1,
  "mute": true
}
```

**Response:**
```json
{
  "status": "success",
  "channel": 1,
  "muted": true
}
```

### WebSocket

#### WS /ws/meters
Real-time meter updates and AI decisions.

**Message Format:**
```json
{
  "timestamp": 1719964800.123,
  "ai_enabled": true,
  "channels": [
    {
      "channel": 1,
      "name": "Vocal",
      "level_db": -12.5,
      "fader_value": 0.75,
      "muted": false,
      "stats": {
        "samples": 100,
        "avg_db": -15.2,
        "max_db": -8.3,
        "std_dev": 4.2,
        "recent_peak": -10.1
      }
    }
  ],
  "ai_decisions": [
    {
      "channel": 3,
      "action": "reduce",
      "current_level": -4.2,
      "new_fader": 0.68,
      "reason": "Peak -4.2dB exceeds threshold -6.0dB",
      "urgency": "high",
      "confidence": 0.95
    }
  ]
}
```

---

## Development Commands

### Backend

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (macOS/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run development server
python -m app.main

# Run with auto-reload
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Run tests
pytest
pytest -v  # verbose
pytest --cov  # with coverage
```

### Frontend

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run type-check

# Lint
npm run lint
npm run lint:fix
```

### Electron

```bash
# From project root

# Install dependencies
npm install

# Run in development
npm run electron:dev

# Build for current platform
npm run build

# Build for specific platform
npm run build:win     # Windows installer
npm run build:mac     # macOS dmg
npm run build:linux   # Linux AppImage
```

### Full Stack Development

```bash
# Run everything at once (recommended)
npm run dev

# This starts:
# 1. Python backend (port 8000)
# 2. Vite dev server (port 5173)
# 3. Electron window (loads when both ready)
```

---

## Configuration

### Backend Configuration

**File:** `backend/app/config.py`

```python
class Settings(BaseSettings):
    # XR18 Mixer Configuration
    xr18_ip: str = "192.168.1.1"
    xr18_port: int = 10024
    xr18_channels: int = 16

    # Audio Level Thresholds (dB)
    max_threshold_db: float = -6.0      # Start reducing above this
    target_level_db: float = -12.0      # Ideal target level
    min_threshold_db: float = -40.0     # Boost if below this

    # AI Configuration
    ai_history_window: int = 100        # Samples to analyze
    ai_confidence_threshold: float = 0.7  # Minimum confidence to act

    # Server Configuration
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = True

    # WebSocket Configuration
    ws_refresh_rate_ms: int = 50        # 20 updates/second
```

**Override with .env file:**
```bash
# backend/.env
XR18_IP=192.168.10.100
MAX_THRESHOLD_DB=-8.0
TARGET_LEVEL_DB=-15.0
```

### Frontend Configuration

**File:** `frontend/src/services/api.ts`

```typescript
const API_BASE_URL = 'http://localhost:8000';
```

For production builds, this would be `http://127.0.0.1:8000` (same machine).

### Electron Configuration

**File:** `electron/main.js`

```javascript
// Window size
width: 1400,
height: 900,
minWidth: 1200,
minHeight: 700,

// Background color (matches UI)
backgroundColor: '#1a1a1a',
```

---

## Testing

### Backend Tests

```bash
cd backend

# Run all tests
pytest

# Run specific test file
pytest tests/test_ai_controller.py

# Run with coverage
pytest --cov=app --cov-report=html

# Run with verbose output
pytest -v -s
```

**Test Structure:**
```
backend/tests/
├── test_adapters.py          # Adapter tests
├── test_ai_controller.py     # AI logic tests
└── test_api.py               # API endpoint tests
```

### Frontend Tests

```bash
cd frontend

# Run tests (when implemented)
npm test

# Run with coverage
npm run test:coverage
```

---

## Building & Deployment

### Create Production Build

```bash
# From project root

# Build Windows installer
npm run build:win

# Output: dist/xr18-ai-controller-Setup-1.0.0.exe
```

### Build Process

1. **Frontend Build**
   - Vite compiles React + TypeScript
   - Output: `frontend/dist/` (static files)

2. **Backend Package**
   - Python files copied to resources
   - Dependencies bundled (or require Python installed)

3. **Electron Package**
   - Creates native executable
   - Bundles frontend dist
   - Includes Python backend
   - Creates installer

### Installer Contents

```
XR18 AI Controller/
├── xr18-ai-controller.exe    # Electron executable
├── resources/
│   ├── app.asar              # Electron app bundle
│   └── backend/              # Python backend
│       ├── app/
│       └── requirements.txt
└── (Electron runtime files)
```

### Distribution

**Windows:**
- `.exe` installer (NSIS)
- Installs to `C:\Program Files\XR18 AI Controller\`
- Creates desktop shortcut
- Adds to Start Menu

**macOS:**
- `.dmg` disk image
- Drag to Applications folder

**Linux:**
- `.AppImage` (portable)
- No installation required

---

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to mixer

**Solutions:**
1. Verify mixer is on same network
   ```bash
   ping 192.168.1.1
   ```

2. Check mixer IP address (may have changed)
   - XR18: Connect to mixer WiFi, go to `192.168.1.1`
   - X32: Check network settings on console

3. Verify correct port:
   - XR18: 10024
   - X32/M32: 10023

4. Disable firewall temporarily to test
   ```bash
   # Windows: Temporarily disable Windows Firewall
   # Or add exception for port 10024/10023
   ```

5. Check mixer firmware supports OSC control

### Backend Startup Issues

**Problem:** Python backend doesn't start

**Solutions:**
1. Check Python version
   ```bash
   python --version  # Should be 3.11+
   ```

2. Reinstall dependencies
   ```bash
   cd backend
   pip install --upgrade -r requirements.txt
   ```

3. Check for port conflicts
   ```bash
   # Windows
   netstat -ano | findstr :8000
   
   # macOS/Linux
   lsof -i :8000
   ```

### WebSocket Connection Issues

**Problem:** Frontend not receiving updates

**Solutions:**
1. Check WebSocket connection in browser console
   ```
   Failed to connect to ws://localhost:8000/ws/meters
   ```

2. Verify backend is running
   ```
   curl http://localhost:8000/
   ```

3. Clear browser cache and reload

### AI Not Adjusting Levels

**Problem:** AI mode enabled but no adjustments

**Checklist:**
1. ✅ Mixer connected
2. ✅ AI mode enabled (toggle shows purple)
3. ✅ Channels have signal (meters showing activity)
4. ✅ Levels actually exceeding thresholds (check settings)

**Debug:**
- Check browser console for AI decisions
- Verify threshold settings in `backend/app/config.py`
- Look for AI decisions in WebSocket messages

### Build Issues

**Problem:** Electron build fails

**Solutions:**
1. Clean and rebuild
   ```bash
   rm -rf node_modules dist frontend/dist
   npm run install:all
   npm run build
   ```

2. Check Node.js version
   ```bash
   node --version  # Should be 20+
   ```

3. Windows: Install windows-build-tools
   ```bash
   npm install --global windows-build-tools
   ```

---

## Known Limitations

### Current Version (1.0.0)

1. **Single Mixer Connection**
   - Can only control one mixer at a time
   - Future: Multi-mixer support

2. **Behringer Only**
   - Currently supports XR18, X32, M32
   - Architecture ready for Yamaha, Allen & Heath, etc.

3. **Basic AI Algorithm**
   - Statistical analysis only
   - Future: Machine learning models, pattern recognition

4. **No Mixer State Persistence**
   - Doesn't save/load mixer scenes
   - Future: Scene management integration

5. **Network Only**
   - Requires mixer on network
   - No USB/MIDI control

6. **English Only**
   - UI only in English
   - Future: Internationalization

### Performance Limits

- **Recommended:** 32 channels max (X32/M32)
- **Refresh Rate:** Fixed at 50ms (20Hz)
- **History Window:** 100 samples (5 seconds at 20Hz)

### OSC Protocol Limitations

- One-way communication for meters (no confirmation)
- Latency depends on network quality
- No mixer state synchronization on connect

---

## Future Enhancements

### Phase 2
- [ ] Yamaha CL/QL adapter
- [ ] Allen & Heath SQ adapter
- [ ] Scene save/load integration
- [ ] Advanced ML models

### Phase 3
- [ ] Multi-mixer control
- [ ] Cloud sync of settings
- [ ] Mobile app (iOS/Android)
- [ ] Plugin system for custom processors

---

## Support

For issues, questions, or contributions:

- **Author:** Jorge Moreno
- **Project:** https://github.com/jmoreno2/xr18-ai-controller
- **Organization:** AutoZone/ALLDATA

---

**Version:** 1.0.0  
**Last Updated:** 2026-07-03  
**Platform:** Windows / macOS / Linux
