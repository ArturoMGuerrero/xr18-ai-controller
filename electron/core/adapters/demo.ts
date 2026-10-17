import type { LinkState, MixerInfo } from '../../../shared/types';
import { faderToDb } from '../audio';
import { MODELS } from './behringer';
import { assertChannel, assertFader, type AdapterEvents, type ChannelState, type MixerAdapter } from './types';

type Pattern = {
  type: 'dynamic' | 'steady' | 'rhythmic' | 'silent';
  baseLevel: number;
  variance: number;
  frequency: number;
  offset: number;
};

const DEMO_NAMES = [
  'Kick', 'Snare', 'HiHat', 'Tom 1', 'Tom 2', 'Overhead L', 'Overhead R', 'Bass DI',
  'Guitar 1', 'Guitar 2', 'Keys L', 'Keys R', 'Vocal 1', 'Vocal 2', 'Vocal 3', 'FX Return',
];

const uniform = (min: number, max: number) => min + Math.random() * (max - min);
const gauss = (sd: number) => {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()) * sd;
};

/** Simulated console. Its meters are post-fader, so AI moves are visible immediately. */
export class DemoAdapter implements MixerAdapter {
  readonly meterTap = 'post' as const;
  readonly info: MixerInfo;

  private linkState: LinkState = 'disconnected';
  private timer: NodeJS.Timeout | null = null;
  private readonly start = Date.now();
  private readonly patterns: Pattern[] = [];
  private readonly channels: ChannelState[] = [];

  constructor(
    model: 'xr18' | 'x32' | 'm32' = 'xr18',
    private readonly events: AdapterEvents = {},
  ) {
    const spec = MODELS[model] ?? MODELS.xr18;
    this.info = {
      name: `${spec.name} (DEMO)`,
      model: model.toUpperCase(),
      ip: 'DEMO MODE',
      port: 0,
      channels: spec.channels,
      buses: spec.buses,
    };

    const types: Pattern['type'][] = ['dynamic', 'steady', 'rhythmic', 'silent'];
    for (let ch = 1; ch <= spec.channels; ch++) {
      this.patterns.push({
        type: types[Math.floor(Math.random() * types.length)],
        baseLevel: uniform(-30, -10),
        variance: uniform(3, 15),
        frequency: uniform(0.5, 3),
        offset: uniform(0, 2 * Math.PI),
      });
      this.channels.push({
        channel: ch,
        name: DEMO_NAMES[ch - 1] ?? `CH ${String(ch).padStart(2, '0')}`,
        level_db: -Infinity,
        fader_value: 0.75,
        muted: false,
      });
    }
  }

  link(): LinkState {
    return this.linkState;
  }

  async connect(): Promise<MixerInfo> {
    this.timer = setInterval(() => this.simulate(), 50);
    this.linkState = 'connected';
    this.events.link?.('connected');
    return this.info;
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.linkState = 'disconnected';
    this.events.link?.('disconnected');
  }

  getChannels(): ChannelState[] {
    return this.channels.map((ch) => ({ ...ch }));
  }

  setFader(channel: number, value: number): void {
    assertChannel(channel, this.info.channels);
    assertFader(value);
    this.channels[channel - 1].fader_value = value;
  }

  setMute(channel: number, mute: boolean): void {
    assertChannel(channel, this.info.channels);
    this.channels[channel - 1].muted = mute;
  }

  private simulate(): void {
    const elapsed = (Date.now() - this.start) / 1000;

    this.channels.forEach((ch, i) => {
      if (ch.muted) {
        ch.level_db = -Infinity;
        return;
      }

      const p = this.patterns[i];
      let level: number;
      switch (p.type) {
        case 'silent':
          level = uniform(-70, -60);
          break;
        case 'steady':
          level = p.baseLevel + gauss(2);
          break;
        case 'rhythmic': {
          const beat = Math.abs(Math.sin(elapsed * p.frequency * 2 * Math.PI + p.offset));
          level = beat > 0.7 ? p.baseLevel + uniform(0, p.variance) : p.baseLevel - uniform(10, 20);
          break;
        }
        default: {
          const wave =
            (Math.sin(elapsed * p.frequency * 2 * Math.PI + p.offset) +
              0.5 * Math.sin(elapsed * p.frequency * 1.5 * 2 * Math.PI)) /
            1.5;
          level = p.baseLevel + wave * p.variance;
        }
      }

      level += gauss(1) + faderToDb(ch.fader_value);
      ch.level_db = Math.max(-70, Math.min(3, level));
    });
  }
}
