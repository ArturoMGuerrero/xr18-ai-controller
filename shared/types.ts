// Types shared between the Electron main process (mixer engine) and the React UI.
// Type-only: this file must not contain runtime values, so the renderer never has
// to bundle anything from outside frontend/.

export type MixerModel = 'xr18' | 'x32' | 'm32' | 'demo';

export interface MixerInfo {
  name: string;
  model: string;
  ip: string;
  port: number;
  channels: number;
  buses: number;
  firmware?: string;
}

export interface ConnectionConfig {
  mixer_model: MixerModel;
  ip_address: string;
  port?: number;
}

export interface DiscoveredMixer {
  ip: string;
  port: number;
  name: string;
  model: string;
  firmware: string;
}

/** `connected` = data flowing, `lost` = no packets from the mixer for a few seconds. */
export type LinkState = 'disconnected' | 'connected' | 'lost';

export interface ChannelStats {
  samples: number;
  avg_db: number | null;
  max_db: number | null;
  min_db: number | null;
  std_dev: number | null;
  recent_peak: number | null;
}

export interface ChannelInfo {
  channel: number;
  name: string;
  level_db: number;
  fader_value: number;
  muted: boolean;
  stats?: ChannelStats | null;
}

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export interface AIDecision {
  channel: number;
  action: 'reduce' | 'increase' | 'maintain';
  current_level: number;
  new_fader: number | null;
  reason: string;
  urgency: Urgency;
  confidence: number;
}

export type AlertType = 'clipping_risk' | 'low_signal' | 'noise_floor' | 'sudden_drop';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface MixerAlert {
  alert_id: string;
  type: AlertType;
  severity: AlertSeverity;
  channel: number;
  message: string;
  timestamp: number;
  suggested_action?: string;
}

export interface MeterData {
  timestamp: number;
  ai_enabled: boolean;
  link: LinkState;
  channels: ChannelInfo[];
  ai_decisions: AIDecision[];
  alerts: MixerAlert[];
}

/** Where the mixer taps the channel meters: before or after the fader. */
export type MeterTap = 'pre' | 'post';

export interface AIConfig {
  maxThreshold: number;
  targetLevel: number;
  minThreshold: number;
  historyWindow: number;
  confidenceThreshold: number;
  adjustmentSpeed: number;
  /** Most the AI may pull a fader below where the engineer left it (dB). */
  maxCutDb: number;
  /** Most the AI may push a fader above where the engineer left it (dB). */
  maxBoostDb: number;
  meterTap: MeterTap;
}

export interface ChannelConfig {
  channel: number;
  max_threshold_db: number;
  target_level_db: number;
  min_threshold_db: number;
  auto_adjust_enabled: boolean;
}

export type ResponseStyle = 'aggressive' | 'moderate' | 'conservative';

export interface LearningStats {
  total_adjustments: number;
  channels_with_learning: number;
  channels: Record<number, { adjustments: number; style: ResponseStyle }>;
}

export interface ChannelLearningStats {
  channel: number;
  adjustments_recorded: number;
  response_style?: ResponseStyle;
  has_learned_behavior: boolean;
}

export interface MixerPreset {
  name: string;
  description: string;
  created_at: string;
  channels: number;
}

/** On-disk / export format of a preset (compatible with v1.x exports). */
export interface PresetFile {
  name: string;
  description: string;
  created_at: string;
  channel_configs: Record<string, ChannelConfig & { adjustment_speed?: number }>;
  fader_positions: Record<string, number>;
  mute_states: Record<string, boolean>;
}

export interface HistoryState {
  description: string | null;
  can_undo: boolean;
  can_redo: boolean;
}

/** Everything the UI can ask the mixer engine to do. */
export interface MixerApi {
  connect(config: ConnectionConfig): Promise<MixerInfo>;
  disconnect(): Promise<void>;
  discover(timeoutMs?: number): Promise<DiscoveredMixer[]>;
  getStatus(): Promise<{ link: LinkState; ai_enabled: boolean; mixer_info: MixerInfo | null }>;

  setAiEnabled(enabled: boolean): Promise<void>;
  getAiConfig(): Promise<AIConfig>;
  setAiConfig(config: AIConfig): Promise<void>;
  configureChannel(config: ChannelConfig): Promise<void>;

  setFader(channel: number, value: number): Promise<void>;
  setMute(channel: number, mute: boolean): Promise<void>;
  undo(): Promise<HistoryState>;
  redo(): Promise<HistoryState>;

  setLearningEnabled(enabled: boolean): Promise<void>;
  getLearningStatus(): Promise<{ learning_enabled: boolean; stats: LearningStats }>;
  getChannelLearningStats(channel: number): Promise<ChannelLearningStats>;

  listPresets(): Promise<MixerPreset[]>;
  savePreset(name: string, description: string): Promise<MixerPreset>;
  loadPreset(name: string): Promise<void>;
  deletePreset(name: string): Promise<void>;
  exportPreset(name: string): Promise<PresetFile>;
  importPreset(data: unknown): Promise<MixerPreset>;
}

export type MixerMethod = keyof MixerApi;

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** What the preload script exposes as `window.mixer`. */
export interface MixerBridge {
  call<M extends MixerMethod>(
    method: M,
    ...args: Parameters<MixerApi[M]>
  ): Promise<IpcResult<Awaited<ReturnType<MixerApi[M]>>>>;
  onFrame(listener: (frame: MeterData) => void): () => void;
  platform: string;
}
