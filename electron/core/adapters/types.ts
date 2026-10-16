import type { LinkState, MeterTap, MixerInfo } from '../../../shared/types';

export interface ChannelState {
  channel: number;
  name: string;
  level_db: number;
  fader_value: number;
  muted: boolean;
}

export interface AdapterEvents {
  /** A fader moved from somewhere other than this app (desk surface, tablet, another app). */
  externalFader?: (channel: number, value: number) => void;
  link?: (state: LinkState) => void;
}

export interface MixerAdapter {
  readonly info: MixerInfo;
  /** Fixed meter tap for this adapter, or null when it depends on the console (use config). */
  readonly meterTap: MeterTap | null;
  link(): LinkState;
  connect(): Promise<MixerInfo>;
  disconnect(): Promise<void>;
  getChannels(): ChannelState[];
  setFader(channel: number, value: number): void;
  setMute(channel: number, mute: boolean): void;
}

export function assertChannel(channel: number, channels: number): void {
  if (!Number.isInteger(channel) || channel < 1 || channel > channels) {
    throw new Error(`Invalid channel ${channel} (1-${channels})`);
  }
}

export function assertFader(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid fader value ${value} (0.0-1.0)`);
  }
}
