import type {
  AIConfig,
  ChannelConfig,
  ConnectionConfig,
  MeterData,
  MixerApi,
  MixerBridge,
  MixerInfo,
  MixerMethod,
} from '../types';

declare global {
  interface Window {
    /** Provided by electron/preload.ts. Missing when the UI runs in a plain browser. */
    mixer?: MixerBridge;
  }
}

function bridge(): MixerBridge {
  if (!window.mixer) {
    throw new Error('Mixer engine not available: run the app with `npm run dev` (Electron), not in a browser.');
  }
  return window.mixer;
}

async function call<M extends MixerMethod>(
  method: M,
  ...args: Parameters<MixerApi[M]>
): Promise<Awaited<ReturnType<MixerApi[M]>>> {
  const result = await bridge().call(method, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Talks to the mixer engine in Electron's main process over IPC. */
export class APIService {
  async connectMixer(config: ConnectionConfig): Promise<{ status: string; mixer_info: MixerInfo }> {
    return { status: 'connected', mixer_info: await call('connect', config) };
  }

  disconnectMixer() {
    return call('disconnect');
  }

  discoverMixers(timeoutMs?: number) {
    return call('discover', timeoutMs);
  }

  getStatus() {
    return call('getStatus');
  }

  setAIMode(enabled: boolean) {
    return call('setAiEnabled', enabled);
  }

  configureChannel(config: ChannelConfig) {
    return call('configureChannel', config);
  }

  setFader(channel: number, value: number) {
    return call('setFader', channel, value);
  }

  setMute(channel: number, mute: boolean) {
    return call('setMute', channel, mute);
  }

  undo() {
    return call('undo');
  }

  redo() {
    return call('redo');
  }

  onFrame(listener: (frame: MeterData) => void): () => void {
    return window.mixer ? window.mixer.onFrame(listener) : () => {};
  }

  // ==================== AI Configuration ====================

  getAIConfig() {
    return call('getAiConfig');
  }

  updateAIConfig(config: AIConfig) {
    return call('setAiConfig', config);
  }

  // ==================== Learning Mode ====================

  setLearningMode(enabled: boolean) {
    return call('setLearningEnabled', enabled);
  }

  getLearningStatus() {
    return call('getLearningStatus');
  }

  getChannelLearningStats(channel: number) {
    return call('getChannelLearningStats', channel);
  }

  // ==================== Presets ====================

  async listPresets() {
    return { presets: await call('listPresets') };
  }

  savePreset(name: string, description: string) {
    return call('savePreset', name, description);
  }

  loadPreset(name: string) {
    return call('loadPreset', name);
  }

  deletePreset(name: string) {
    return call('deletePreset', name);
  }

  exportPreset(name: string) {
    return call('exportPreset', name);
  }

  importPreset(data: unknown) {
    return call('importPreset', data);
  }
}

export const apiService = new APIService();
