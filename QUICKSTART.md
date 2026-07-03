# Quick Start Guide

Get XR18 AI Controller running in 5 minutes.

## Prerequisites

- ✅ Python 3.11+ installed
- ✅ Node.js 20+ installed
- ✅ Behringer XR18, X32, or M32 mixer on your network

## Step 1: Install Dependencies

### Windows
```bash
# Double-click setup.bat
# OR run in terminal:
setup.bat
```

### macOS/Linux
```bash
chmod +x setup.sh
./setup.sh
```

### Manual Installation
```bash
# Install everything at once
npm run install:all
```

## Step 2: Configure Mixer IP

Edit `backend/.env`:
```bash
XR18_IP=192.168.1.1  # Change to your mixer's IP
```

**How to find mixer IP:**
- XR18: Connect to mixer WiFi, IP is usually `192.168.1.1`
- X32: Check network settings on console screen

## Step 3: Run the App

```bash
npm run dev
```

This will:
1. Start Python backend (http://localhost:8000)
2. Start React frontend (http://localhost:5173)
3. Open Electron window

## Step 4: Connect to Mixer

1. In the app, select your mixer model (XR18, X32, or M32)
2. Enter mixer IP address
3. Click "Connect"
4. Wait for green "Connected" status

## Step 5: Try AI Mode

1. Click the AI toggle switch
2. Make some noise into a microphone connected to the mixer
3. Watch as AI automatically adjusts levels
4. See AI decisions in the panel

## Troubleshooting

**Can't connect to mixer?**
```bash
# Test connection
ping 192.168.1.1
```

**Backend won't start?**
```bash
# Check Python version
python --version  # Should be 3.11+

# Reinstall dependencies
cd backend
pip install -r requirements.txt
```

**Frontend won't start?**
```bash
# Check Node version
node --version  # Should be 20+

# Reinstall dependencies
cd frontend
npm install
```

## Next Steps

- Read [CLAUDE.md](./CLAUDE.md) for complete documentation
- Adjust thresholds in `backend/app/config.py`
- Build installer: `npm run build:win`

## Support

For issues or questions, check the [CLAUDE.md](./CLAUDE.md) Troubleshooting section.
