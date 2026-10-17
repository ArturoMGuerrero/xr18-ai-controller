import type { AlertType, ChannelStats, MixerAlert } from '../../shared/types';
import { SILENCE_DB } from './audio';

export interface AlertConfig {
  clipping_threshold_db: number;
  clipping_consecutive_samples: number;
  low_signal_threshold_db: number;
  low_signal_duration_sec: number;
  noise_floor_std_dev_threshold: number;
  noise_floor_duration_sec: number;
  sudden_drop_threshold_db: number;
  sudden_drop_time_window_sec: number;
  alert_cooldown_sec: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  clipping_threshold_db: -3,
  clipping_consecutive_samples: 3,
  low_signal_threshold_db: -40,
  low_signal_duration_sec: 10,
  noise_floor_std_dev_threshold: 1,
  noise_floor_duration_sec: 30,
  sudden_drop_threshold_db: 12,
  sudden_drop_time_window_sec: 1,
  alert_cooldown_sec: 30,
};

interface ChannelAlertState {
  hotSamples: number;
  lowSince: number | null;
  flatSince: number | null;
  recent: { at: number; db: number }[];
}

/**
 * Detects clipping risk, sustained low signal, dead channels (flat noise floor) and
 * sudden drops to silence (cable pulled). Durations are measured in wall-clock time,
 * not in history samples, so they work with any history window.
 */
export class AlertEngine {
  config: AlertConfig = { ...DEFAULT_ALERT_CONFIG };
  private state = new Map<number, ChannelAlertState>();
  private lastAlert = new Map<string, number>();
  private counter = 0;

  check(channel: number, currentDb: number, stats: ChannelStats | null, now: number): MixerAlert[] {
    const c = this.config;
    const s = this.channelState(channel);
    const alerts: MixerAlert[] = [];
    const level = Number.isFinite(currentDb) ? currentDb : -90;

    // Clipping risk: several consecutive hot samples
    s.hotSamples = level > c.clipping_threshold_db ? s.hotSamples + 1 : 0;
    if (s.hotSamples >= c.clipping_consecutive_samples) {
      this.raise(alerts, now, channel, 'clipping_risk', 'critical',
        `Clipping risk on Channel ${channel}: level at ${level.toFixed(1)}dB`,
        `Reduce gain on Channel ${channel} by at least ${Math.max(3, level + 6).toFixed(1)}dB`);
    }

    const avg = stats?.avg_db ?? null;

    // Low signal: present but quiet for a sustained time
    const isLow = avg !== null && avg < c.low_signal_threshold_db && avg > SILENCE_DB;
    s.lowSince = isLow ? (s.lowSince ?? now) : null;
    if (s.lowSince !== null && now - s.lowSince >= c.low_signal_duration_sec * 1000) {
      this.raise(alerts, now, channel, 'low_signal', 'warning',
        `Low signal on Channel ${channel}: avg ${avg!.toFixed(1)}dB for ${((now - s.lowSince) / 1000).toFixed(0)}s`,
        `Check input connection or increase gain on Channel ${channel}`);
    }

    // Noise floor: almost no variation at a low level = probably nothing plugged in
    const isFlat = avg !== null && stats?.std_dev != null && stats.std_dev < c.noise_floor_std_dev_threshold && avg < -35;
    s.flatSince = isFlat ? (s.flatSince ?? now) : null;
    if (s.flatSince !== null && now - s.flatSince >= c.noise_floor_duration_sec * 1000) {
      this.raise(alerts, now, channel, 'noise_floor', 'info',
        `Possible dead channel ${channel}: noise floor detected`,
        `Check if Channel ${channel} is being used or mute it`);
    }

    // Sudden drop: active signal that falls straight to silence
    const windowMs = c.sudden_drop_time_window_sec * 1000;
    s.recent = s.recent.filter((r) => now - r.at <= windowMs);
    if (level <= SILENCE_DB && s.recent.length > 0) {
      const before = s.recent.reduce((sum, r) => sum + r.db, 0) / s.recent.length;
      if (before > SILENCE_DB && before - level > c.sudden_drop_threshold_db) {
        this.raise(alerts, now, channel, 'sudden_drop', 'warning',
          `Sudden drop on Channel ${channel}: ${(before - level).toFixed(1)}dB drop detected`,
          `Check input connection on Channel ${channel}`);
      }
    }
    s.recent.push({ at: now, db: level });

    return alerts;
  }

  reset(): void {
    this.state.clear();
    this.lastAlert.clear();
  }

  private raise(
    alerts: MixerAlert[],
    now: number,
    channel: number,
    type: AlertType,
    severity: MixerAlert['severity'],
    message: string,
    suggested_action: string,
  ): void {
    const key = `${channel}:${type}`;
    if (now - (this.lastAlert.get(key) ?? -Infinity) < this.config.alert_cooldown_sec * 1000) return;
    this.lastAlert.set(key, now);
    alerts.push({
      alert_id: `alert_${now}_${++this.counter}`,
      type,
      severity,
      channel,
      message,
      timestamp: now / 1000,
      suggested_action,
    });
  }

  private channelState(channel: number): ChannelAlertState {
    let s = this.state.get(channel);
    if (!s) this.state.set(channel, (s = { hotSamples: 0, lowSince: null, flatSince: null, recent: [] }));
    return s;
  }
}
