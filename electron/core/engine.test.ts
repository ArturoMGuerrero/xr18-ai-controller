import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LinkState, MeterData, MixerInfo } from '../../shared/types';
import type { AdapterEvents, ChannelState, MixerAdapter } from './adapters/types';
import { faderToDb } from './audio';
import { MixerEngine } from './engine';

class FakeAdapter implements MixerAdapter {
  readonly meterTap = 'pre' as const;
  readonly info: MixerInfo = { name: 'Fake', model: 'XR18', ip: '1.2.3.4', port: 10024, channels: 2, buses: 6 };
  state: LinkState = 'connected';
  channels: ChannelState[] = [1, 2].map((channel) => ({
    channel, name: `CH ${channel}`, level_db: -20, fader_value: 0.75, muted: false,
  }));
  constructor(readonly events: AdapterEvents) {}
  link() { return this.state; }
  async connect() { return this.info; }
  async disconnect() { this.state = 'disconnected'; }
  getChannels() { return this.channels.map((c) => ({ ...c })); }
  setFader(channel: number, value: number) { this.channels[channel - 1].fader_value = value; }
  setMute(channel: number, mute: boolean) { this.channels[channel - 1].muted = mute; }
}

describe('MixerEngine', () => {
  let dir: string;
  let clock: number;
  let adapter: FakeAdapter;
  let engine: MixerEngine;
  let frames: MeterData[];

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xr18-engine-'));
    clock = 0;
    frames = [];
    engine = new MixerEngine({
      dataDir: dir,
      tickMs: 60_000, // ticks are driven by hand
      now: () => clock,
      adapterFactory: (_config, events) => (adapter = new FakeAdapter(events)),
    });
    engine.onFrame((f) => frames.push(f));
    await engine.connect({ mixer_model: 'xr18', ip_address: '1.2.3.4' });
  });

  afterEach(async () => {
    await engine.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      clock += 50;
      engine.tick();
    }
  };

  it('publishes one frame per tick with clean numbers', () => {
    adapter.channels[1].level_db = -Infinity;
    tick();
    expect(frames).toHaveLength(1);
    expect(frames[0].link).toBe('connected');
    expect(frames[0].channels[1].level_db).toBe(-90);
  });

  it('turns a fader drag into one undo step and one learning sample', async () => {
    for (const v of [0.74, 0.72, 0.7, 0.68]) {
      await engine.setFader(1, v);
      clock += 30;
    }
    tick(20); // gesture ends

    expect(adapter.channels[0].fader_value).toBe(0.68);
    expect((await engine.getLearningStatus()).stats.total_adjustments).toBe(1);

    const undone = await engine.undo();
    expect(undone.description).toBe('Set CH1 fader from 0.75 to 0.68');
    expect(adapter.channels[0].fader_value).toBe(0.75);
    expect(undone.can_undo).toBe(false);
    await engine.redo();
    expect(adapter.channels[0].fader_value).toBe(0.68);
  });

  it('blocks manual faders and undo while the AI is in control', async () => {
    await engine.setAiEnabled(true);
    await expect(engine.setFader(1, 0.5)).rejects.toThrow(/AI mode/);
    await expect(engine.undo()).rejects.toThrow(/AI mode/);
    await engine.setMute(1, true); // mutes are always allowed
    expect(adapter.channels[0].muted).toBe(true);
  });

  it('lets the AI cut a hot channel, within its limit', async () => {
    adapter.channels[0].level_db = -1;
    await engine.setAiEnabled(true);
    tick(400);

    const fader = adapter.channels[0].fader_value;
    expect(faderToDb(fader)).toBeLessThan(0);
    expect(faderToDb(fader)).toBeGreaterThanOrEqual(-12.01);
    expect(frames.some((f) => f.ai_decisions.some((d) => d.channel === 1 && d.action === 'reduce'))).toBe(true);
  });

  it('backs off a channel the engineer grabs on the desk', async () => {
    adapter.channels[0].level_db = -1;
    await engine.setAiEnabled(true);
    tick(20);

    adapter.channels[0].fader_value = 0.72; // still hot: -1 dB meter + -1.2 dB fader
    adapter.events.externalFader?.(1, 0.72);
    tick(100); // 5 s: inside the 10 s hold
    expect(adapter.channels[0].fader_value).toBe(0.72);

    tick(200); // hold over: AI resumes, anchored to the engineer's 0.72
    expect(adapter.channels[0].fader_value).toBeLessThan(0.72);
    expect(faderToDb(adapter.channels[0].fader_value)).toBeGreaterThanOrEqual(faderToDb(0.72) - 12.01);
  });

  it('freezes the AI while the link to the mixer is lost', async () => {
    adapter.channels[0].level_db = -1;
    adapter.state = 'lost';
    await engine.setAiEnabled(true);
    tick(200);
    expect(adapter.channels[0].fader_value).toBe(0.75);
    expect(frames.at(-1)?.link).toBe('lost');
  });

  it('saves presets to disk and applies them', async () => {
    await engine.savePreset('Show', 'Main set');
    adapter.setFader(1, 0.2);
    adapter.setMute(2, true);

    const reopened = new MixerEngine({ dataDir: dir, adapterFactory: (_c, e) => (adapter = new FakeAdapter(e)) });
    await reopened.connect({ mixer_model: 'xr18', ip_address: '1.2.3.4' });
    expect((await reopened.listPresets()).map((p) => p.name)).toEqual(['Show']);
    adapter.setFader(1, 0.2);
    await reopened.loadPreset('Show');
    expect(adapter.channels[0].fader_value).toBe(0.75);
    await reopened.dispose();
  });

  it('rejects invalid presets on import', async () => {
    await expect(engine.importPreset({ name: 'x', fader_positions: { 1: 2 }, mute_states: {} })).rejects.toThrow();
    await expect(engine.importPreset('nope')).rejects.toThrow();
  });

  it('validates and persists AI config', async () => {
    await expect(engine.setAiConfig({ ...(await engine.getAiConfig()), minThreshold: -5 })).rejects.toThrow(/Min < Target < Max/);
    await engine.setAiConfig({ ...(await engine.getAiConfig()), maxCutDb: 6, meterTap: 'post' });
    const reopened = new MixerEngine({ dataDir: dir });
    expect(await reopened.getAiConfig()).toMatchObject({ maxCutDb: 6, meterTap: 'post' });
  });
});
