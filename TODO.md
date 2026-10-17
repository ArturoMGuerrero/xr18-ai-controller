# TODO - Initial Setup Checklist

## Before First Run

- [ ] Install Node.js 22 (`node --version`)
- [ ] Run `npm run install:all`
- [ ] Create icon file: `installer/icon.ico` (see `installer/ICON_README.txt`) for the tray icon

## Testing Connectivity

- [ ] Power on Behringer mixer
- [ ] Connect mixer to network (WiFi or Ethernet)
- [ ] In the app, click **Find mixers on the network** (or enter the IP)
  - XR18: Connect to mixer WiFi, usually `192.168.1.1`
  - X32: Check network settings on console
- [ ] If nothing answers: `ping <mixer-ip>` and check the firewall allows UDP

## First Run Against Real Hardware

- [ ] Run `npm run dev`
- [ ] Connect to mixer in app: header shows "Mixer Connected"
- [ ] Meters move with signal on each channel
- [ ] Channel names and fader positions match the console
- [ ] Moving a fader in the app moves it on the console, and vice versa
- [ ] Check whether channel meters change when a fader moves; set **Mixer Meter Tap** in AI Settings accordingly
- [ ] Test AI mode with live audio, starting with a small **Max Cut** (e.g. 6 dB)
- [ ] Unplug the network cable: header shows "Mixer Not Responding", AI holds; plug back: recovers

## Optional: Production Build

- [ ] Update version number in `package.json`
- [ ] Build installer: `npm run build:win`
- [ ] Test installer on a clean machine (no Node, no Python)

## Future Enhancements (Ideas)

- [ ] Web server mode to control from a phone/tablet on the same network
- [ ] Auto-detect pre/post-fader meter tap
- [ ] Bus/aux send control (monitor mixes)
- [ ] Scene save/load on the console
- [ ] Add Yamaha CL/QL adapter
- [ ] Add Allen & Heath SQ adapter
- [ ] Multi-mixer control
- [ ] MIDI controller support

---

Last updated: 2026-10-13
