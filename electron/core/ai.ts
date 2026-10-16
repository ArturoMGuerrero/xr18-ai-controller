import type {
  AIConfig,
  ChannelLearningStats,
  ChannelStats,
  LearningStats,
  MeterTap,
  ResponseStyle,
  Urgency,
} from '../../shared/types';
import { dbToFader, faderToDb, SILENCE_DB } from './audio';

export const DEFAULT_AI_CONFIG: AIConfig = {
  maxThreshold: -6,
  targetLevel: -12,
  minThreshold: -40,
  historyWindow: 100,
  confidenceThreshold: 0.7,
  adjustmentSpeed: 0.8,
  maxCutDb: 12,
  maxBoostDb: 6,
  meterTap: 'pre',
};

export interface ChannelAIConfig {
  channel: number;
  max_threshold_db: number;
  target_level_db: number;
  min_threshold_db: number;
  auto_adjust_enabled: boolean;
  adjustment_speed: number;
}

export interface Decision {
  channel: number;
  action: 'reduce' | 'increase' | 'maintain';
  /** Output level the decision was based on (meter adjusted for the fader). */
  current_level_db: number;
  suggested_fader: number | null;
  confidence: number;
  reason: string;
  urgency: Urgency;
}

export interface Sample {
  channel: number;
  meterDb: number;
  fader: number;
  /** Fader position the engineer set; the AI stays within maxCut/maxBoost of it. */
  referenceFader: number;
  tap: MeterTap;
  now: number;
}

/** Channels averaging below this are treated as noise/unused and never boosted. */
const BOOST_FLOOR_DB = -50;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function push(history: number[], value: number, max: number) {
  history.push(value);
  if (history.length > max) history.splice(0, history.length - max);
}

/**
 * Statistical level controller.
 *
 * It keeps a fader-independent history of each channel's source level, so the stats
 * it acts on shift immediately when it moves a fader. That is what stops it from
 * compounding corrections; on top of that every move is rate-limited and bounded to
 * maxCutDb/maxBoostDb around the engineer's fader position.
 */
export class AIController {
  config: AIConfig = { ...DEFAULT_AI_CONFIG };
  readonly learning = new LearningModel();

  private channelConfigs = new Map<number, ChannelAIConfig>();
  private source = new Map<number, number[]>();
  private meter = new Map<number, number[]>();
  private nextActionAt = new Map<number, number>();

  setConfig(config: AIConfig): void {
    this.config = { ...config };
    for (const [channel, existing] of this.channelConfigs) {
      this.channelConfigs.set(channel, {
        ...existing,
        max_threshold_db: config.maxThreshold,
        target_level_db: config.targetLevel,
        min_threshold_db: config.minThreshold,
        adjustment_speed: config.adjustmentSpeed,
      });
    }
  }

  configureChannel(config: Partial<ChannelAIConfig> & { channel: number }): void {
    this.channelConfigs.set(config.channel, { ...this.channelConfig(config.channel), ...config });
  }

  channelConfig(channel: number): ChannelAIConfig {
    return (
      this.channelConfigs.get(channel) ?? {
        channel,
        max_threshold_db: this.config.maxThreshold,
        target_level_db: this.config.targetLevel,
        min_threshold_db: this.config.minThreshold,
        auto_adjust_enabled: true,
        adjustment_speed: this.config.adjustmentSpeed,
      }
    );
  }

  allChannelConfigs(): ChannelAIConfig[] {
    return [...this.channelConfigs.values()];
  }

  /** Records a meter reading. Call once per tick for every channel, AI on or off. */
  observe({ channel, meterDb, fader, tap }: Omit<Sample, 'referenceFader' | 'now'>): void {
    const level = Number.isFinite(meterDb) ? meterDb : -90;
    push(this.history(this.meter, channel), level, this.config.historyWindow);

    // Post-fader meters say nothing about the source while the fader is (nearly) down.
    if (tap === 'post' && fader < 0.01) return;
    const sourceDb = tap === 'pre' ? level : level - faderToDb(fader);
    push(this.history(this.source, channel), sourceDb, this.config.historyWindow);
  }

  /** Meter statistics shown in the UI and used by the alert engine. */
  stats(channel: number): ChannelStats | null {
    const history = this.meter.get(channel);
    if (!history || history.length < 5) return null;
    const valid = history.filter((x) => x > SILENCE_DB);
    const recent = history.length >= 10 ? Math.max(...history.slice(-10)) : null;
    if (valid.length === 0) {
      return { samples: history.length, avg_db: null, max_db: null, min_db: null, std_dev: null, recent_peak: recent };
    }
    return {
      samples: history.length,
      avg_db: mean(valid),
      max_db: Math.max(...valid),
      min_db: Math.min(...valid),
      std_dev: std(valid),
      recent_peak: recent,
    };
  }

  decide({ channel, fader, referenceFader, now }: Omit<Sample, 'meterDb' | 'tap'>): Decision {
    const config = this.channelConfig(channel);
    const faderDb = faderToDb(fader);
    const sourceHistory = this.source.get(channel) ?? [];
    const output = sourceHistory.map((s) => s + faderDb);
    const current = output.at(-1) ?? -Infinity;
    const hold = (reason: string, confidence = 1): Decision => ({
      channel,
      action: 'maintain',
      current_level_db: current,
      suggested_fader: null,
      confidence,
      reason,
      urgency: 'low',
    });

    if (!config.auto_adjust_enabled) return hold('Auto-adjust disabled for this channel');
    if (output.length < 10) return hold('Insufficient data for analysis', 0);
    if (fader < 0.01) return hold('Fader is down');

    const valid = output.filter((x) => x > SILENCE_DB);
    if (valid.length < 5) return hold('Signal too low or silent', 0.5);

    const avg = mean(valid);
    const max = Math.max(...valid);
    const sd = std(valid);
    const recentPeak = Math.max(...output.slice(-10));

    let proposal: { delta: number; confidence: number; reason: string; urgency: Urgency } | null = null;

    if (recentPeak > -3) {
      proposal = {
        delta: -Math.max(1, recentPeak - config.max_threshold_db),
        confidence: 1,
        reason: `CRITICAL: Peak ${recentPeak.toFixed(1)}dB approaching clipping`,
        urgency: 'critical',
      };
    } else if (max > config.max_threshold_db) {
      const over = max - config.max_threshold_db;
      proposal = {
        delta: -(max - config.target_level_db) * (sd > 6 ? 1.2 : 1),
        confidence: clamp(0.6 + over / 15, 0, 1),
        reason: `Peak ${max.toFixed(1)}dB exceeds threshold ${config.max_threshold_db.toFixed(1)}dB`,
        urgency: max > -3 ? 'high' : 'medium',
      };
    } else if (avg < config.min_threshold_db && avg > BOOST_FLOOR_DB && valid.length >= output.length / 2) {
      // Only boost real, mostly-present signal: pushing up a noise floor just adds hiss and feedback risk.
      proposal = {
        delta: Math.min(12, config.target_level_db - avg),
        confidence: 0.7,
        reason: `Avg ${avg.toFixed(1)}dB below minimum ${config.min_threshold_db.toFixed(1)}dB`,
        urgency: 'low',
      };
    } else if (avg > config.target_level_db && config.max_threshold_db - avg < 3 && sd > 4) {
      proposal = {
        delta: -3,
        confidence: 0.7,
        reason: `Low headroom (${(config.max_threshold_db - avg).toFixed(1)}dB) with dynamic signal`,
        urgency: 'medium',
      };
    }

    if (!proposal) {
      return hold(`Levels optimal (avg: ${avg.toFixed(1)}dB, peak: ${max.toFixed(1)}dB)`);
    }

    const learned = this.learning.shape(channel, proposal);
    const critical = learned.urgency === 'critical';

    if (!critical && learned.confidence < this.config.confidenceThreshold) {
      return hold(`${learned.reason} (confidence ${(learned.confidence * 100).toFixed(0)}% below threshold)`, learned.confidence);
    }
    if (now < (this.nextActionAt.get(channel) ?? 0)) {
      return hold(`${learned.reason} (waiting for last adjustment to settle)`, learned.confidence);
    }

    // Rate limit: non-critical moves are capped per step; criticals go all the way.
    const speed = clamp(config.adjustment_speed, 0.1, 1);
    const maxStep = 1 + 5 * speed;
    const step = critical ? learned.delta : clamp(learned.delta, -maxStep, maxStep);

    // Never wander further than maxCut/maxBoost from where the engineer put the fader.
    const referenceDb = Math.max(faderToDb(referenceFader), -60);
    const targetDb = clamp(faderDb + step, referenceDb - this.config.maxCutDb, Math.min(10, referenceDb + this.config.maxBoostDb));
    const newFader = dbToFader(targetDb);

    if (Math.abs(faderToDb(newFader) - faderDb) < 0.25) {
      return hold(`${learned.reason} (AI limit reached: ±${this.config.maxCutDb}/${this.config.maxBoostDb}dB around your fader)`, learned.confidence);
    }

    this.nextActionAt.set(channel, now + (critical ? 300 : 2000 * (1.2 - speed)));

    return {
      channel,
      action: step < 0 ? 'reduce' : 'increase',
      current_level_db: current,
      suggested_fader: newFader,
      confidence: learned.confidence,
      reason: learned.reason,
      urgency: learned.urgency,
    };
  }

  reset(): void {
    this.source.clear();
    this.meter.clear();
    this.nextActionAt.clear();
  }

  private history(map: Map<number, number[]>, channel: number): number[] {
    let history = map.get(channel);
    if (!history) map.set(channel, (history = []));
    return history;
  }
}

// ==================== Learning ====================

export interface ManualAdjustment {
  channel: number;
  timestamp: number;
  previous_level_db: number;
  previous_fader: number;
  new_fader: number;
  level_after_db?: number | null;
}

interface LearnedPattern {
  preferred_level_range: number[];
  typical_adjustments: { level_db: number; fader_change: number; db_change: number }[];
  response_style: ResponseStyle;
}

/** On-disk format (v1.0, compatible with files saved by the Python version). */
export interface LearningFile {
  version: '1.0';
  saved_at: string;
  learning_enabled: boolean;
  history_window: number;
  manual_adjustments: ManualAdjustment[];
  learned_patterns: Record<string, LearnedPattern>;
  channels_config: Record<string, ChannelAIConfig>;
}

/** Learns how big the engineer's own corrections are and shapes AI moves to match. */
export class LearningModel {
  enabled = true;
  private adjustments: ManualAdjustment[] = [];
  private patterns = new Map<number, LearnedPattern>();

  record(adjustment: ManualAdjustment): void {
    if (!this.enabled) return;
    this.adjustments.push(adjustment);
    if (this.adjustments.length > 500) this.adjustments.splice(0, this.adjustments.length - 500);

    const pattern = this.patterns.get(adjustment.channel) ?? {
      preferred_level_range: [],
      typical_adjustments: [],
      response_style: 'moderate' as ResponseStyle,
    };
    this.patterns.set(adjustment.channel, pattern);

    const before = Math.max(faderToDb(adjustment.previous_fader), -90);
    const after = Math.max(faderToDb(adjustment.new_fader), -90);
    pattern.typical_adjustments.push({
      level_db: Number.isFinite(adjustment.previous_level_db) ? adjustment.previous_level_db : -90,
      fader_change: adjustment.new_fader - adjustment.previous_fader,
      db_change: after - before,
    });
    if (pattern.typical_adjustments.length > 100) pattern.typical_adjustments.splice(0, pattern.typical_adjustments.length - 100);

    if (pattern.typical_adjustments.length >= 10) {
      const avgChange = mean(pattern.typical_adjustments.slice(-10).map((a) => Math.abs(a.fader_change)));
      pattern.response_style = avgChange > 0.15 ? 'aggressive' : avgChange < 0.05 ? 'conservative' : 'moderate';
    }
  }

  shape<T extends { delta: number; urgency: Urgency }>(channel: number, proposal: T): T {
    const style = this.enabled ? this.patterns.get(channel)?.response_style : undefined;
    if (!style || style === 'moderate') return proposal;
    if (style === 'aggressive') {
      return { ...proposal, delta: proposal.delta * 1.25, urgency: proposal.urgency === 'medium' ? 'high' : proposal.urgency };
    }
    return { ...proposal, delta: proposal.delta * 0.5, urgency: proposal.urgency === 'high' ? 'medium' : proposal.urgency };
  }

  stats(): LearningStats {
    const channels: LearningStats['channels'] = {};
    for (const [ch, p] of this.patterns) channels[ch] = { adjustments: p.typical_adjustments.length, style: p.response_style };
    return { total_adjustments: this.adjustments.length, channels_with_learning: this.patterns.size, channels };
  }

  channelStats(channel: number): ChannelLearningStats {
    const p = this.patterns.get(channel);
    if (!p) return { channel, adjustments_recorded: 0, has_learned_behavior: false };
    return {
      channel,
      adjustments_recorded: p.typical_adjustments.length,
      response_style: p.response_style,
      has_learned_behavior: p.typical_adjustments.length >= 10,
    };
  }

  toFile(ai: AIController): LearningFile {
    return {
      version: '1.0',
      saved_at: new Date().toISOString(),
      learning_enabled: this.enabled,
      history_window: ai.config.historyWindow,
      manual_adjustments: this.adjustments,
      learned_patterns: Object.fromEntries([...this.patterns].map(([ch, p]) => [String(ch), p])),
      channels_config: Object.fromEntries(ai.allChannelConfigs().map((c) => [String(c.channel), c])),
    };
  }

  loadFile(data: Partial<LearningFile>, ai: AIController): void {
    if (data.version && data.version !== '1.0') throw new Error(`Unsupported learning data version: ${data.version}`);
    this.enabled = data.learning_enabled ?? true;
    this.adjustments = Array.isArray(data.manual_adjustments) ? data.manual_adjustments : [];
    this.patterns = new Map(
      Object.entries(data.learned_patterns ?? {}).map(([ch, p]) => [
        Number(ch),
        {
          preferred_level_range: p.preferred_level_range ?? [],
          typical_adjustments: p.typical_adjustments ?? [],
          response_style: p.response_style ?? 'moderate',
        },
      ]),
    );
    for (const config of Object.values(data.channels_config ?? {})) ai.configureChannel(config);
  }
}
