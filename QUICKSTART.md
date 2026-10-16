# Quick Start Guide

Get XR18 AI Controller running in 5 minutes.

## Prerequisites

- ✅ Node.js 22 (for development; the installer needs nothing)
- ✅ Behringer XR18, X32, or M32 on your network (or use Demo mode)

## Step 1: Install Dependencies

```bash
npm run install:all
```

## Step 2: Run the App

```bash
npm run dev
```

This starts the Vite dev server, compiles the Electron/mixer engine in watch mode and opens the app window.

## Step 3: Connect to the Mixer

1. Select your mixer model, or click **🔍 Find mixers on the network** and pick it from the list
2. Check the IP address
   - XR18 on its own WiFi access point: usually `192.168.1.1`
   - X32: Setup → Network on the console
3. Click **Connect**: the app only reports "Connected" once the console has actually answered

No mixer handy? Click **🎭 Quick Demo**.

## Step 4: Try AI Mode

1. Set your faders where you want them, then turn on the AI toggle
2. Send signal into the console
3. The AI moves faders gently, never more than **Max Cut / Max Boost** (AI Settings) from where you left them
4. Grab a fader on the desk at any time: the AI follows you and leaves that channel alone for 10 s

**Important:** in AI Settings, set **Mixer Meter Tap** to match your console. If the channel meters do not
move when you move a fader, the meters are pre-fader (the default).

## Troubleshooting

**"No response from …" when connecting?**
- Is this computer on the mixer's network? (`ping 192.168.1.1`)
- Is UDP blocked by a firewall? The console replies from port 10024 (XR) / 10023 (X32)
- Working on WiFi + USB/Ethernet at the same time? See `scripts/verify-dual-setup.bat`

**"Mixer Not Responding" in the header?**
The link dropped (WiFi, cable, console rebooted). The AI freezes all faders and the app reconnects by itself
as soon as the console answers again.
