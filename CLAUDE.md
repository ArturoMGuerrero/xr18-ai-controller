# XR18 AI Controller - Instructions

Desktop application with AI-powered automatic level control for Behringer XR18, X32, and M32 digital mixing consoles.

**Last Updated:** 2026-10-13
**Author:** Jorge Moreno
**Version:** 2.0.0

---

## Project Overview

The app monitors channel levels over OSC and, in AI mode, moves channel faders to prevent clipping and keep
levels near a target. Everything runs in one Electron app: the React UI in the renderer, the mixer engine
(OSC, AI, alerts, presets) in TypeScript in the main process. There is no Python and no local HTTP server.

### Use Cases

1. Live sound reinforcement with automatic gain riding
2. Recording sessions with consistent level monitoring
3. Broadcast/streaming applications requiring constant levels
4. Protection against sudden level spikes and clipping

---

## Project Structure

```
xr18-ai-controller/
├── electron/                     # Main process (TypeScript, compiled to build/electron)
│   ├── main.ts                   # Window, tray, single-instance lock, lifecycle
│   ├── preload.ts                # Sandboxed bridge: exposes window.mixer
│   ├── ipc.ts                    # One IPC channel ("mixer:call") → MixerEngine methods
│   └── core/
│       ├── engine.ts             # MixerEngine: connection, control loop, MixerApi
│       ├── ai.ts                 # AIController (+ LearningModel)
│       ├── alerts.ts             # AlertEngine
│       ├── commandHistory.ts     # Undo/redo
│       ├── presets.ts            # Preset validation + presets.json
│       ├── store.ts              # Atomic JSON files in the user data folder
│       ├── osc.ts                # OSC 1.0 encode/decode
│       ├── audio.ts              # Fader law, meter blob parsing
│       ├── adapters/
│       │   ├── types.ts          # MixerAdapter interface
│       │   ├── behringer.ts      # X32/M32 + X Air (XR12/16/18, MR18) over UDP; discovery
│       │   └── demo.ts           # Simulated console
│       └── *.test.ts             # Vitest
├── shared/types.ts               # Types shared by engine and UI (type-only!)
├── frontend/                     # React 18 + Vite + Tailwind UI
│   └── src/
│       ├── services/api.ts       # Typed wrapper over window.mixer
│       ├── hooks/useMixerFeed.ts # Meter frames pushed from the engine
│       └── components/           # ChannelStrip, AISettings, PresetManager, AlertSystem, ...
├── scripts/                      # Windows network diagnostics (WiFi + USB setups)
├── installer/                    # Icons (add icon.ico to get a tray icon)
├── tsconfig.electron.json
├── vitest.config.mts
└── package.json                  # Electron app + engine; frontend has its own package.json
```

---

## Technology Stack

- **Electron 43** (main process runs the mixer engine; renderer is sandboxed, `contextIsolation` on)
- **TypeScript** everywhere (strict)
- **React 18**, Vite, Tailwind CSS
- **Vitest** for engine tests
- **OSC over UDP**, implemented in `electron/core/osc.ts` (no dependency); X Air port 10024, X32/M32 port 10023
- Persistence: JSON files in Electron's `userData` folder (`settings.json`, `presets.json`, `learning.json`)

---

## Development

```bash
npm run install:all     # npm install (root) + frontend
npm run dev             # Vite dev server + tsc --watch + Electron
npm test                # engine tests
npm run typecheck       # engine types
npm run lint --prefix frontend
npm run build:win       # installer (also build:mac, build:linux)
```

`npm run dev` loads the UI from `http://localhost:5173`; packaged builds load `frontend/dist/index.html`
(Vite `base: './'` keeps asset URLs relative for `file://`). After changing engine code, restart Electron
(tsc recompiles automatically; the main process does not hot-reload).

The UI only works inside Electron: in a plain browser `window.mixer` is missing and API calls throw.

---

## Architecture

```
┌──────────── Renderer (React, sandboxed) ────────────┐
│  apiService.call(...)          useMixerFeed()       │
└───────┬───────────────────────────────▲─────────────┘
        │ ipcRenderer.invoke            │ 'mixer:frame' (~20/s)
        │ 'mixer:call' (method, args)   │
┌───────▼───────────── Main process ────┴─────────────┐
│ MixerEngine ── one control loop (50 ms tick):       │
│   adapter.getChannels → ai.observe → ai.decide →    │
│   adapter.setFader → alerts.check → emit frame      │
│ Adapter: BehringerAdapter | DemoAdapter             │
└───────┬─────────────────────────────────────────────┘
        │ OSC / UDP (one socket: the console replies to the source port)
   Behringer / Midas console
```

- **Single control loop** in the engine, independent of how many windows are open. The AI runs exactly once
  per tick, and keeps running if the window is hidden in the tray.
- **IPC contract**: `MixerApi` in `shared/types.ts`. `ipc.ts` whitelists method names; errors return as
  `{ ok: false, error }` and `apiService` rethrows them as `Error(message)`.
- `shared/types.ts` must stay type-only: the sandboxed preload can only `require('electron')`, and Vite
  does not bundle files outside `frontend/`.

### OSC details (Behringer)

- Connect = `/xinfo` handshake (retries for 2.5 s). Its reply gives name, model and firmware; the model
  string sets the channel count (XR12 → 12, XR16/XR18/MR18 → 16, X32/M32 → 32).
- Subscriptions (`/xremote` and `/meters ,s /meters/1`) expire after 10 s and are renewed every 8 s.
- `/meters/1` is a blob: little-endian int32 count, then values. X Air sends int16 in 1/256 dB, X32 sends
  float32 linear. `parseMeterBlob` derives the width from the blob size.
- On connect (and after a link drop) the adapter queries `mix/fader`, `mix/on` and `config/name` for every channel.
- `mix/on`: 1 = channel on, 0 = muted. Faders are floats 0..1 with the console's piecewise fader law
  (`audio.ts`: 0.75 = 0 dB, 1.0 = +10 dB, 0.5 = −10, 0.25 = −30, 0.0625 = −60).
- Link watchdog: no packets for 2 s → ping with `/xinfo`; for 4.5 s → link `lost`. The first packet back
  marks it `connected` and re-subscribes and re-reads state.
- Fader updates from the console that don't match what the app just sent are reported as
  `externalFader` (someone moved the desk).

### AI (electron/core/ai.ts)

- Keeps a **fader-independent source history** per channel: `meter` for pre-fader meters,
  `meter − fader dB` for post-fader. Output stats = source + current fader dB, so a fader move is reflected
  immediately and corrections don't compound. The meter tap is a setting (`meterTap`, default `pre`);
  the demo adapter is always post-fader.
- Decision rules (critical peak > −3 dB, peak over max threshold, sustained low level, low headroom) produce
  a dB change, shaped by the learning model, then:
  - non-critical moves need `confidence ≥ confidenceThreshold`;
  - per-step limit `1 + 5 × adjustmentSpeed` dB (criticals go all the way);
  - a settle delay after each move (300 ms critical, otherwise `2000 × (1.2 − speed)` ms);
  - the fader stays within **`maxCutDb` / `maxBoostDb` of the reference fader**: the position when AI mode
    was switched on, or the engineer's latest desk move;
  - channels averaging below −50 dB, or silent most of the time, are never boosted.
- While the link is `lost` the AI holds everything. Muted channels are skipped. A desk move on a channel
  pauses the AI on that channel for 10 s and becomes its new reference.

### Learning

Manual moves (UI drags and desk moves) are grouped into gestures (600 ms gap) and recorded as one sample each.
After 10 samples a channel gets a style: aggressive (AI moves ×1.25), moderate, or conservative (×0.5).
Saved automatically to `learning.json` (v1.0 format, compatible with the Python version's files).

### Alerts (electron/core/alerts.ts)

Clipping risk (N consecutive hot samples), low signal and noise floor (measured in wall-clock time), and
sudden drop (recent average falls to silence). Each alert type has a per-channel cooldown (30 s).
Frames carry only newly raised alerts; the UI's AlertSystem accumulates them.

---

## Troubleshooting

**"No response from <ip>:<port>"**: nothing answered `/xinfo`. Check the IP (or use *Find mixers*), that
this computer is on the console's network, and that the firewall allows UDP. With WiFi + USB/Ethernet at the
same time, see `scripts/verify-dual-setup.bat`.

**Header shows "Mixer Not Responding"**: packets stopped. The app keeps renewing and recovers by itself.

**AI keeps pulling a channel down to its limit**: the meter tap setting is probably wrong for the console.
If the console's channel meters don't move when you move the fader, use *Pre-fader*.

**No tray icon**: add `installer/icon.ico` (see `installer/ICON_README.txt`).

---

## Known Limitations

- Controls channel faders and mutes only (no buses/aux sends, no preamp gain)
- One mixer at a time
- Meter tap must be set by hand (no auto-detection yet)
- UI in English only

---

## Support

- **Author:** Jorge Moreno
- **Project:** https://github.com/jmoreno2/xr18-ai-controller
- **Organization:** AutoZone/ALLDATA
