# TODO - Initial Setup Checklist

## Before First Run

- [ ] Install Python 3.11+ (`python --version`)
- [ ] Install Node.js 20+ (`node --version`)
- [ ] Run setup script: `setup.bat` (Windows) or `./setup.sh` (macOS/Linux)
- [ ] Create icon file: `installer/icon.ico` (see `installer/ICON_README.txt`)
- [ ] Configure mixer IP in `backend/.env`

## Testing Connectivity

- [ ] Power on Behringer mixer
- [ ] Connect mixer to network (WiFi or Ethernet)
- [ ] Find mixer IP address
  - XR18: Connect to mixer WiFi, usually `192.168.1.1`
  - X32: Check network settings on console
- [ ] Test connection: `ping <mixer-ip>`
- [ ] Verify OSC port is accessible (no firewall blocking)

## First Development Run

- [ ] Run `npm run dev`
- [ ] Verify backend starts (http://localhost:8000)
- [ ] Verify frontend starts (http://localhost:5173)
- [ ] Verify Electron window opens
- [ ] Connect to mixer in app
- [ ] Test manual fader control
- [ ] Test AI mode with live audio

## Optional: Production Build

- [ ] Create icon.ico (required for branded installer)
- [ ] Update version number in `package.json`
- [ ] Build installer: `npm run build:win`
- [ ] Test installer on clean machine
- [ ] Verify Python backend starts automatically
- [ ] Verify app connects to mixer

## Future Enhancements (Ideas)

- [ ] Add Yamaha CL/QL adapter
- [ ] Add Allen & Heath SQ adapter
- [ ] Implement scene save/load
- [ ] Add machine learning models
- [ ] Create mobile companion app
- [ ] Add cloud settings sync
- [ ] Implement multi-mixer control
- [ ] Add advanced visualizations (spectrograms, etc.)
- [ ] Create plugin system for custom processing
- [ ] Add MIDI controller support

## Documentation

- [ ] Review CLAUDE.md for architecture details
- [ ] Read QUICKSTART.md for basic usage
- [ ] Check API documentation in CLAUDE.md

## Known Issues to Address

- [ ] Add error handling for mixer disconnection
- [ ] Implement reconnection logic
- [ ] Add user preferences persistence
- [ ] Improve meter visualization performance
- [ ] Add keyboard shortcuts
- [ ] Implement undo/redo for manual adjustments

---

Last updated: 2026-07-03
