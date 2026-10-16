import type {
  AIConfig,
  AIDecision,
  ChannelConfig,
  ConnectionConfig,
  HistoryState,
  LinkState,
  MeterData,
  MixerAlert,
  MixerApi,
  MixerInfo,
  MixerPreset,
  PresetFile,
} from '../../shared/types';
import { BehringerAdapter, discoverMixers, MODELS } from './adapters/behringer';
import { DemoAdapter } from './adapters/demo';
import type { AdapterEvents, ChannelState, MixerAdapter } from './adapters/types';
import { AIController, DEFAULT_AI_CONFIG, type Decision, type LearningFile } from './ai';
import { AlertEngine } from './alerts';
import { CommandHistory } from './commandHistory';
import { parsePresetFile, PresetStore } from './presets';
import { JsonStore } from './store';

export type AdapterFactory = (config: ConnectionConfig, events: AdapterEvents) => MixerAdapter;

export const defaultAdapterFactory: AdapterFactory = (config, events) => {
  if (config.mixer_model === 'demo' || config.ip_address.trim().toUpperCase() === 'DEMO') {
    return new DemoAdapter(config.mixer_model === 'demo' ? 'xr18' : config.mixer_model, events);
  }
  if (!(config.mixer_model in MODELS)) throw new Error(`Unknown mixer model: ${config.mixer_model}`);
  const ip = config.ip_address.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error(`Invalid IP address: ${config.ip_address}`);
  return new BehringerAdapter({ model: config.mixer_model as keyof typeof MODELS, ip, port: config.port }, events);
};

export interface EngineOptions {
  dataDir: string;
  tickMs?: number;
  adapterFactory?: AdapterFactory;
  now?: () => number;
}

/** A continuous fader move (UI drag or desk fader), recorded as one undo step / learning sample. */
interface Gesture {
  channel: number;
  startFader: number;
  startLevel: number;
  value: number;
  lastAt: number;
  command?: { newValue: number };
}

const GESTURE_GAP_MS = 600;
const OVERRIDE_HOLD_MS = 10_000;

const clamp = (x: unknown, lo: number, hi: number, fallback: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback;

function sanitizeAiConfig(input: Partial<AIConfig>): AIConfig {
  const d = DEFAULT_AI_CONFIG;
  const config: AIConfig = {
    maxThreshold: clamp(input.maxThreshold, -40, 0, d.maxThreshold),
    targetLevel: clamp(input.targetLevel, -60, 0, d.targetLevel),
    minThreshold: clamp(input.minThreshold, -80, 0, d.minThreshold),
    historyWindow: Math.round(clamp(input.historyWindow, 10, 1000, d.historyWindow)),
    confidenceThreshold: clamp(input.confidenceThreshold, 0, 1, d.confidenceThreshold),
    adjustmentSpeed: clamp(input.adjustmentSpeed, 0.1, 1, d.adjustmentSpeed),
    maxCutDb: clamp(input.maxCutDb, 0, 40, d.maxCutDb),
    maxBoostDb: clamp(input.maxBoostDb, 0, 20, d.maxBoostDb),
    meterTap: input.meterTap === 'post' ? 'post' : input.meterTap === 'pre' ? 'pre' : d.meterTap,
  };
  if (!(config.minThreshold < config.targetLevel && config.targetLevel < config.maxThreshold)) {
    throw new Error('Thresholds must satisfy: Min < Target < Max');
  }
  return config;
}

const db = (x: number) => (Number.isFinite(x) ? Math.max(x, -90) : -90);

/**
 * Owns the mixer connection and runs the single control loop: read meters, let the AI
 * act (if enabled), raise alerts and publish one frame per tick to the UI.
 */
export class MixerEngine implements MixerApi {
  readonly ai = new AIController();
  private readonly alerts = new AlertEngine();
  private readonly history = new CommandHistory();
  private readonly presets: PresetStore;
  private readonly settingsStore: JsonStore<{ aiConfig?: Partial<AIConfig> }>;
  private readonly learningStore: JsonStore<Partial<LearningFile>>;
  private readonly tickMs: number;
  private readonly adapterFactory: AdapterFactory;
  private readonly now: () => number;

  private adapter: MixerAdapter | null = null;
  private aiEnabled = false;
  private timer: NodeJS.Timeout | null = null;
  private learningSaveTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<(frame: MeterData) => void>();
  private snapshot = new Map<number, ChannelState>();
  private referenceFader = new Map<number, number>();
  private overrideUntil = new Map<number, number>();
  private gestures = new Map<number, Gesture>();

  constructor(options: EngineOptions) {
    this.tickMs = options.tickMs ?? 50;
    this.adapterFactory = options.adapterFactory ?? defaultAdapterFactory;
    this.now = options.now ?? Date.now;
    this.presets = new PresetStore(options.dataDir);
    this.settingsStore = new JsonStore(options.dataDir, 'settings.json', () => ({}));
    this.learningStore = new JsonStore(options.dataDir, 'learning.json', () => ({}));

    try {
      this.ai.setConfig(sanitizeAiConfig({ ...DEFAULT_AI_CONFIG, ...this.settingsStore.read().aiConfig }));
    } catch {
      this.ai.setConfig(DEFAULT_AI_CONFIG);
    }
    try {
      this.ai.learning.loadFile(this.learningStore.read(), this.ai);
    } catch (err) {
      console.error('[engine] ignoring unreadable learning data:', (err as Error).message);
    }
  }

  onFrame(listener: (frame: MeterData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    await this.disconnect();
    this.saveLearning();
  }

  // ==================== Connection ====================

  async connect(config: ConnectionConfig): Promise<MixerInfo> {
    await this.disconnect();

    const adapter = this.adapterFactory(config, {
      externalFader: (channel, value) => this.onExternalFader(channel, value),
    });
    const info = await adapter.connect();

    this.adapter = adapter;
    this.ai.reset();
    this.alerts.reset();
    this.snapshot.clear();
    this.referenceFader.clear();
    this.overrideUntil.clear();
    this.gestures.clear();
    this.timer = setInterval(() => this.tick(), this.tickMs);
    return info;
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setAiState(false);
    this.history.clear();
    this.finishGestures(Infinity);
    const adapter = this.adapter;
    this.adapter = null;
    if (adapter) await adapter.disconnect();
  }

  discover(timeoutMs = 1500) {
    return discoverMixers(clamp(timeoutMs, 200, 10_000, 1500));
  }

  async getStatus(): Promise<{ link: LinkState; ai_enabled: boolean; mixer_info: MixerInfo | null }> {
    return {
      link: this.adapter?.link() ?? 'disconnected',
      ai_enabled: this.aiEnabled,
      mixer_info: this.adapter?.info ?? null,
    };
  }

  // ==================== AI ====================

  async setAiEnabled(enabled: boolean): Promise<void> {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    if (enabled) this.requireAdapter();
    this.setAiState(enabled);
  }

  async getAiConfig(): Promise<AIConfig> {
    return { ...this.ai.config };
  }

  async setAiConfig(config: AIConfig): Promise<void> {
    const clean = sanitizeAiConfig(config);
    this.ai.setConfig(clean);
    this.settingsStore.write({ ...this.settingsStore.read(), aiConfig: clean });
  }

  async configureChannel(config: ChannelConfig): Promise<void> {
    if (!Number.isInteger(config.channel) || config.channel < 1) throw new Error('Invalid channel');
    this.ai.configureChannel({
      channel: config.channel,
      max_threshold_db: clamp(config.max_threshold_db, -40, 0, this.ai.config.maxThreshold),
      target_level_db: clamp(config.target_level_db, -60, 0, this.ai.config.targetLevel),
      min_threshold_db: clamp(config.min_threshold_db, -80, 0, this.ai.config.minThreshold),
      auto_adjust_enabled: config.auto_adjust_enabled !== false,
    });
    this.scheduleLearningSave();
  }

  // ==================== Manual control ====================

  async setFader(channel: number, value: number): Promise<void> {
    const adapter = this.requireAdapter();
    if (this.aiEnabled) throw new Error('Cannot set fader manually while AI mode is enabled');
    const current = this.channel(adapter, channel);
    const now = this.now();

    const gesture = this.gestures.get(channel);
    if (gesture?.command && now - gesture.lastAt < GESTURE_GAP_MS) {
      adapter.setFader(channel, value);
      gesture.command.newValue = value;
      gesture.value = value;
      gesture.lastAt = now;
      return;
    }

    this.finishGesture(channel);
    const command = { newValue: value };
    const oldValue = current.fader_value;
    this.history.execute({
      execute: () => adapter.setFader(channel, command.newValue),
      undo: () => adapter.setFader(channel, oldValue),
      get description() {
        return `Set CH${channel} fader from ${oldValue.toFixed(2)} to ${command.newValue.toFixed(2)}`;
      },
      timestamp: new Date(now),
    });
    this.gestures.set(channel, {
      channel,
      startFader: oldValue,
      startLevel: current.level_db,
      value,
      lastAt: now,
      command,
    });
  }

  async setMute(channel: number, mute: boolean): Promise<void> {
    const adapter = this.requireAdapter();
    if (typeof mute !== 'boolean') throw new Error('mute must be a boolean');
    const oldMuted = this.channel(adapter, channel).muted;
    this.history.execute({
      execute: () => adapter.setMute(channel, mute),
      undo: () => adapter.setMute(channel, oldMuted),
      description: `${mute ? 'Muted' : 'Unmuted'} CH${channel}`,
      timestamp: new Date(this.now()),
    });
  }

  async undo(): Promise<HistoryState> {
    this.requireAdapter();
    if (this.aiEnabled) throw new Error('Cannot undo while AI mode is enabled');
    this.finishGestures(Infinity);
    return this.history.undo();
  }

  async redo(): Promise<HistoryState> {
    this.requireAdapter();
    if (this.aiEnabled) throw new Error('Cannot redo while AI mode is enabled');
    this.finishGestures(Infinity);
    return this.history.redo();
  }

  // ==================== Learning ====================

  async setLearningEnabled(enabled: boolean): Promise<void> {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    this.ai.learning.enabled = enabled;
    this.scheduleLearningSave();
  }

  async getLearningStatus() {
    return { learning_enabled: this.ai.learning.enabled, stats: this.ai.learning.stats() };
  }

  async getChannelLearningStats(channel: number) {
    return this.ai.learning.channelStats(channel);
  }

  // ==================== Presets ====================

  async listPresets(): Promise<MixerPreset[]> {
    return this.presets.list();
  }

  async savePreset(name: string, description: string): Promise<MixerPreset> {
    const adapter = this.requireAdapter();
    if (typeof name !== 'string' || typeof description !== 'string') throw new Error('Invalid preset name');
    return this.presets.save(PresetStore.create(name, description, adapter.getChannels(), this.ai.allChannelConfigs()));
  }

  async loadPreset(name: string): Promise<void> {
    const adapter = this.requireAdapter();
    const preset = this.presets.get(name);

    for (const config of Object.values(preset.channel_configs)) {
      if (config.channel >= 1 && config.channel <= adapter.info.channels) this.ai.configureChannel(config);
    }
    for (const [ch, fader] of Object.entries(preset.fader_positions)) {
      const channel = Number(ch);
      if (channel < 1 || channel > adapter.info.channels) continue;
      adapter.setFader(channel, fader);
      this.referenceFader.set(channel, fader);
    }
    for (const [ch, muted] of Object.entries(preset.mute_states)) {
      const channel = Number(ch);
      if (channel >= 1 && channel <= adapter.info.channels) adapter.setMute(channel, muted);
    }
    this.history.clear();
  }

  async deletePreset(name: string): Promise<void> {
    this.presets.delete(name);
  }

  async exportPreset(name: string): Promise<PresetFile> {
    return this.presets.get(name);
  }

  async importPreset(data: unknown): Promise<MixerPreset> {
    return this.presets.save(parsePresetFile(data));
  }

  // ==================== Control loop ====================

  /** Runs one control cycle. Public so tests can drive the loop deterministically. */
  tick(): void {
    const adapter = this.adapter;
    if (!adapter) return;

    const now = this.now();
    const link = adapter.link();
    const tap = adapter.meterTap ?? this.ai.config.meterTap;
    const channels = adapter.getChannels();
    const decisions: AIDecision[] = [];
    const alerts: MixerAlert[] = [];

    this.finishGestures(now);

    // With no data coming in, the AI holds everything where it is.
    if (link === 'connected') {
      for (const ch of channels) {
        this.ai.observe({ channel: ch.channel, meterDb: ch.level_db, fader: ch.fader_value, tap });
      }

      if (this.aiEnabled) {
        for (const ch of channels) {
          if (ch.muted || now < (this.overrideUntil.get(ch.channel) ?? 0)) continue;
          const decision = this.ai.decide({
            channel: ch.channel,
            fader: ch.fader_value,
            referenceFader: this.referenceFader.get(ch.channel) ?? ch.fader_value,
            now,
          });
          if (decision.suggested_fader === null) continue;
          adapter.setFader(ch.channel, decision.suggested_fader);
          ch.fader_value = decision.suggested_fader;
          decisions.push(toUiDecision(decision));
        }
      }

      for (const ch of channels) {
        alerts.push(...this.alerts.check(ch.channel, ch.level_db, this.ai.stats(ch.channel), now));
      }
    }

    this.snapshot = new Map(channels.map((ch) => [ch.channel, ch]));

    const frame: MeterData = {
      timestamp: now / 1000,
      ai_enabled: this.aiEnabled,
      link,
      channels: channels.map((ch) => ({
        channel: ch.channel,
        name: ch.name,
        level_db: db(ch.level_db),
        fader_value: ch.fader_value,
        muted: ch.muted,
        stats: this.ai.stats(ch.channel),
      })),
      ai_decisions: decisions,
      alerts,
    };
    for (const listener of this.listeners) listener(frame);
  }

  private setAiState(enabled: boolean): void {
    if (enabled && !this.aiEnabled) {
      // Where the engineer left each fader is the AI's anchor.
      this.finishGestures(Infinity);
      this.referenceFader = new Map(this.adapter!.getChannels().map((ch) => [ch.channel, ch.fader_value]));
      this.overrideUntil.clear();
    }
    this.aiEnabled = enabled;
    this.history.setEnabled(!enabled);
  }

  /** Someone moved a fader on the desk (or another app). */
  private onExternalFader(channel: number, value: number): void {
    const now = this.now();
    if (this.aiEnabled) {
      // The engineer is overriding: follow them and keep the AI off this channel for a bit.
      this.referenceFader.set(channel, value);
      this.overrideUntil.set(channel, now + OVERRIDE_HOLD_MS);
    }

    const gesture = this.gestures.get(channel);
    if (gesture && !gesture.command && now - gesture.lastAt < GESTURE_GAP_MS) {
      gesture.value = value;
      gesture.lastAt = now;
      return;
    }
    this.finishGesture(channel);
    const before = this.snapshot.get(channel);
    if (!before) return;
    this.gestures.set(channel, {
      channel,
      startFader: before.fader_value,
      startLevel: before.level_db,
      value,
      lastAt: now,
    });
  }

  private finishGestures(now: number): void {
    for (const gesture of [...this.gestures.values()]) {
      if (now - gesture.lastAt >= GESTURE_GAP_MS) this.finishGesture(gesture.channel);
    }
  }

  private finishGesture(channel: number): void {
    const gesture = this.gestures.get(channel);
    if (!gesture) return;
    this.gestures.delete(channel);
    if (Math.abs(gesture.value - gesture.startFader) < 0.005) return;
    this.ai.learning.record({
      channel,
      timestamp: gesture.lastAt / 1000,
      previous_level_db: gesture.startLevel,
      previous_fader: gesture.startFader,
      new_fader: gesture.value,
    });
    this.scheduleLearningSave();
  }

  private scheduleLearningSave(): void {
    if (this.learningSaveTimer) return;
    this.learningSaveTimer = setTimeout(() => this.saveLearning(), 5000);
  }

  private saveLearning(): void {
    if (this.learningSaveTimer) clearTimeout(this.learningSaveTimer);
    this.learningSaveTimer = null;
    try {
      this.learningStore.write(this.ai.learning.toFile(this.ai));
    } catch (err) {
      console.error('[engine] could not save learning data:', (err as Error).message);
    }
  }

  private requireAdapter(): MixerAdapter {
    if (!this.adapter) throw new Error('Not connected to mixer');
    return this.adapter;
  }

  private channel(adapter: MixerAdapter, channel: number): ChannelState {
    const state = adapter.getChannels().find((ch) => ch.channel === channel);
    if (!state) throw new Error(`Channel ${channel} not found`);
    return state;
  }
}

function toUiDecision(d: Decision): AIDecision {
  return {
    channel: d.channel,
    action: d.action,
    current_level: db(d.current_level_db),
    new_fader: d.suggested_fader,
    reason: d.reason,
    urgency: d.urgency,
    confidence: d.confidence,
  };
}
