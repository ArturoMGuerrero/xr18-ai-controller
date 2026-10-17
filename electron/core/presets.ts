import type { MixerPreset, PresetFile } from '../../shared/types';
import type { ChannelAIConfig } from './ai';
import { JsonStore } from './store';

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Validates an imported preset (v1.x export format) and normalises it. */
export function parsePresetFile(data: unknown): PresetFile {
  if (!isRecord(data)) throw new Error('Preset must be a JSON object');
  const { name, description, created_at, channel_configs, fader_positions, mute_states } = data;
  if (typeof name !== 'string' || !name.trim()) throw new Error('Preset needs a "name"');
  if (!isRecord(fader_positions) || !isRecord(mute_states)) {
    throw new Error('Preset needs "fader_positions" and "mute_states"');
  }

  const faders: Record<string, number> = {};
  for (const [ch, v] of Object.entries(fader_positions)) {
    if (!/^\d+$/.test(ch) || typeof v !== 'number' || v < 0 || v > 1) throw new Error(`Invalid fader for channel ${ch}`);
    faders[ch] = v;
  }
  const mutes: Record<string, boolean> = {};
  for (const [ch, v] of Object.entries(mute_states)) {
    if (!/^\d+$/.test(ch) || typeof v !== 'boolean') throw new Error(`Invalid mute state for channel ${ch}`);
    mutes[ch] = v;
  }

  return {
    name: name.trim(),
    description: typeof description === 'string' ? description : '',
    created_at: typeof created_at === 'string' ? created_at : new Date().toISOString(),
    channel_configs: isRecord(channel_configs) ? (channel_configs as PresetFile['channel_configs']) : {},
    fader_positions: faders,
    mute_states: mutes,
  };
}

export function summarize(preset: PresetFile): MixerPreset {
  return {
    name: preset.name,
    description: preset.description,
    created_at: preset.created_at,
    channels: Object.keys(preset.fader_positions).length,
  };
}

/** Presets saved to presets.json (they used to live only in memory). */
export class PresetStore {
  private readonly store: JsonStore<Record<string, PresetFile>>;
  private presets: Record<string, PresetFile>;

  constructor(dir: string) {
    this.store = new JsonStore(dir, 'presets.json', () => ({}));
    this.presets = this.store.read();
  }

  list(): MixerPreset[] {
    return Object.values(this.presets)
      .map(summarize)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  get(name: string): PresetFile {
    const preset = this.presets[name];
    if (!preset) throw new Error(`Preset '${name}' not found`);
    return preset;
  }

  save(preset: PresetFile): MixerPreset {
    this.presets[preset.name] = preset;
    this.store.write(this.presets);
    return summarize(preset);
  }

  delete(name: string): void {
    this.get(name);
    delete this.presets[name];
    this.store.write(this.presets);
  }

  static create(
    name: string,
    description: string,
    channels: { channel: number; fader_value: number; muted: boolean }[],
    configs: ChannelAIConfig[],
  ): PresetFile {
    if (!name.trim()) throw new Error('Please enter a preset name');
    return {
      name: name.trim(),
      description,
      created_at: new Date().toISOString(),
      channel_configs: Object.fromEntries(configs.map((c) => [String(c.channel), c])),
      fader_positions: Object.fromEntries(channels.map((c) => [String(c.channel), c.fader_value])),
      mute_states: Object.fromEntries(channels.map((c) => [String(c.channel), c.muted])),
    };
  }
}
