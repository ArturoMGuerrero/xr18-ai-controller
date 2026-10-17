// Runs sandboxed: only 'electron' may be required here, so imports from shared/ are type-only.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MeterData, MixerBridge } from '../shared/types';

const bridge: MixerBridge = {
  call: (method, ...args) => ipcRenderer.invoke('mixer:call', method, args),
  onFrame: (listener) => {
    const handler = (_event: IpcRendererEvent, frame: MeterData) => listener(frame);
    ipcRenderer.on('mixer:frame', handler);
    return () => {
      ipcRenderer.removeListener('mixer:frame', handler);
    };
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('mixer', bridge);
