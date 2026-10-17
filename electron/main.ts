import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { MixerEngine } from './core/engine';
import { registerIpc } from './ipc';

// Compiled to build/electron/main.js; the repo root is two levels up.
const ROOT = path.join(__dirname, '..', '..');
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let engine: MixerEngine | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#1a1a1a',
    icon: path.join(ROOT, 'installer', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(ROOT, 'frontend', 'dist', 'index.html'));
  }

  // Closing the window hides it to the tray (when there is one); quit from the tray menu.
  win.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'installer', 'icon.ico'));
  if (icon.isEmpty()) {
    console.warn('[app] installer/icon.ico not found; running without a tray icon');
    return;
  }

  tray = new Tray(icon);
  tray.setToolTip('XR18 AI Controller');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show XR18 Controller', click: () => mainWindow?.show() },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('double-click', () => mainWindow?.show());
}

if (!app.requestSingleInstanceLock()) {
  // A second copy would fight the first one over the mixer.
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.whenReady().then(() => {
    engine = new MixerEngine({ dataDir: app.getPath('userData') });
    registerIpc(engine, () => mainWindow?.webContents ?? null);
    mainWindow = createWindow();
    createTray();
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  else mainWindow?.show();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  isQuitting = true;
  if (!engine) return;
  // Release the mixer subscription and flush learning data before exiting.
  event.preventDefault();
  const closing = engine;
  engine = null;
  closing.dispose().finally(() => app.quit());
});
