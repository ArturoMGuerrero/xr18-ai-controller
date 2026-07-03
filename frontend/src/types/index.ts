export interface MixerInfo {
  name: string;
  model: string;
  ip: string;
  port: number;
  channels: number;
  buses: number;
}

export interface ChannelInfo {
  channel: number;
  name: string;
  level_db: number;
  fader_value: number;
  muted: boolean;
  stats?: ChannelStats;
}

export interface ChannelStats {
  samples: number;
  avg_db: number | null;
  max_db: number | null;
  min_db: number | null;
  std_dev: number | null;
  recent_peak: number | null;
}

export interface AIDecision {
  channel: number;
  action: 'reduce' | 'increase' | 'maintain';
  current_level: number;
  new_fader: number | null;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
}

export interface MeterData {
  timestamp: number;
  ai_enabled: boolean;
  channels: ChannelInfo[];
  ai_decisions: AIDecision[];
}

export interface ConnectionConfig {
  mixer_model: 'xr18' | 'x32' | 'm32';
  ip_address: string;
  port?: number;
}

export interface ChannelConfig {
  channel: number;
  max_threshold_db: number;
  target_level_db: number;
  min_threshold_db: number;
  auto_adjust_enabled: boolean;
}
