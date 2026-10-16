import { ipcMain, type WebContents } from 'electron';
import type { IpcResult, MixerApi, MixerMethod } from '../shared/types';
import type { MixerEngine } from './core/engine';

const METHODS: readonly MixerMethod[] = [
  'connect', 'disconnect', 'discover', 'getStatus',
  'setAiEnabled', 'getAiConfig', 'setAiConfig', 'configureChannel',
  'setFader', 'setMute', 'undo', 'redo',
  'setLearningEnabled', 'getLearningStatus', 'getChannelLearningStats',
  'listPresets', 'savePreset', 'loadPreset', 'deletePreset', 'exportPreset', 'importPreset',
];

/** Exposes the engine's MixerApi over one IPC channel; errors come back as values. */
export function registerIpc(engine: MixerEngine, getTarget: () => WebContents | null): () => void {
  ipcMain.handle('mixer:call', async (_event, method: unknown, args: unknown): Promise<IpcResult<unknown>> => {
    if (typeof method !== 'string' || !METHODS.includes(method as MixerMethod) || !Array.isArray(args)) {
      return { ok: false, error: `Unknown method: ${String(method)}` };
    }
    try {
      const fn = engine[method as MixerMethod] as (...a: unknown[]) => ReturnType<MixerApi[MixerMethod]>;
      return { ok: true, value: await fn.apply(engine, args) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const unsubscribe = engine.onFrame((frame) => {
    const target = getTarget();
    if (target && !target.isDestroyed()) target.send('mixer:frame', frame);
  });

  return () => {
    ipcMain.removeHandler('mixer:call');
    unsubscribe();
  };
}
