import { describe, expect, it } from 'vitest';
import type { MeterTap } from '../../shared/types';
import { AIController, DEFAULT_AI_CONFIG } from './ai';
import { faderToDb } from './audio';

/** Drives the controller like the engine does, against a simulated channel. */
function simulate(opts: { tap: MeterTap; source: (i: number) => number; ticks: number; fader?: number; ai?: AIController }) {
  const ai = opts.ai ?? new AIController();
  ai.setConfig({ ...ai.config, meterTap: opts.tap });
  let fader = opts.fader ?? 0.75;
  const reference = fader;
  const moves: number[] = [];

  for (let i = 0; i < opts.ticks; i++) {
    const now = i * 50;
    const source = opts.source(i);
    const meterDb = opts.tap === 'pre' ? source : source + faderToDb(fader);
    ai.observe({ channel: 1, meterDb, fader, tap: opts.tap });
    const decision = ai.decide({ channel: 1, fader, referenceFader: reference, now });
    if (decision.suggested_fader !== null) {
      fader = decision.suggested_fader;
      moves.push(fader);
    }
  }
  return { ai, fader, moves };
}

describe('AIController', () => {
  it('does not run the fader to zero when pre-fader meters never drop', () => {
    // Pre-fader meter stuck hot: pulling the fader never changes what the meter reads.
    const { fader, moves } = simulate({ tap: 'pre', source: () => -2, ticks: 2000 });

    expect(faderToDb(fader)).toBeGreaterThanOrEqual(-DEFAULT_AI_CONFIG.maxCutDb - 0.01);
    expect(moves.length).toBeGreaterThan(0);
    // Once at the limit it stops moving.
    expect(moves.at(-1)).toBe(fader);
    expect(new Set(moves.slice(-1)).size).toBe(1);
  });

  it('pre-fader: brings the output under the max threshold, without overshooting', () => {
    const { fader } = simulate({ tap: 'pre', source: () => -1, ticks: 1000 });
    const output = -1 + faderToDb(fader);
    expect(output).toBeLessThanOrEqual(DEFAULT_AI_CONFIG.maxThreshold);
    expect(output).toBeGreaterThan(DEFAULT_AI_CONFIG.targetLevel - 4);
  });

  it('post-fader: converges instead of compounding cuts from stale history', () => {
    const { fader } = simulate({ tap: 'post', source: (i) => -4 + Math.sin(i / 3), ticks: 1000 });
    const peakOutput = -3 + faderToDb(fader);
    expect(peakOutput).toBeLessThanOrEqual(DEFAULT_AI_CONFIG.maxThreshold);
    expect(faderToDb(fader)).toBeGreaterThan(-DEFAULT_AI_CONFIG.maxCutDb);
  });

  it('boosts quiet channels but no more than maxBoostDb', () => {
    const { fader } = simulate({ tap: 'pre', source: () => -48, ticks: 2000 });
    expect(faderToDb(fader)).toBeCloseTo(DEFAULT_AI_CONFIG.maxBoostDb, 0);
  });

  it('never boosts a noise floor or a mostly-silent channel', () => {
    const noise = simulate({ tap: 'pre', source: () => -57, ticks: 1000 });
    expect(noise.moves).toEqual([]);
    // Occasional blips over -60 on an otherwise dead channel
    const blips = simulate({ tap: 'pre', source: (i) => (i % 3 === 0 ? -45 : -75), ticks: 1000 });
    expect(blips.moves).toEqual([]);
  });

  it('leaves silent channels alone', () => {
    const { moves } = simulate({ tap: 'pre', source: () => -80, ticks: 500 });
    expect(moves).toEqual([]);
  });

  it('respects the confidence threshold for non-critical moves', () => {
    const ai = new AIController();
    ai.setConfig({ ...ai.config, confidenceThreshold: 1 });
    const { moves } = simulate({ ai, tap: 'pre', source: () => -48, ticks: 500 });
    expect(moves).toEqual([]);
  });

  it('respects per-channel auto adjust', () => {
    const ai = new AIController();
    ai.configureChannel({ channel: 1, auto_adjust_enabled: false });
    const { moves } = simulate({ ai, tap: 'pre', source: () => -1, ticks: 500 });
    expect(moves).toEqual([]);
  });

  it('reports meter stats for the UI', () => {
    const ai = new AIController();
    for (let i = 0; i < 20; i++) ai.observe({ channel: 3, meterDb: i % 2 ? -10 : -20, fader: 0.75, tap: 'pre' });
    const stats = ai.stats(3)!;
    expect(stats.samples).toBe(20);
    expect(stats.avg_db).toBeCloseTo(-15);
    expect(stats.max_db).toBe(-10);
    expect(stats.recent_peak).toBe(-10);
  });
});

describe('LearningModel', () => {
  it('classifies the engineer as conservative and halves AI moves', () => {
    const ai = new AIController();
    for (let i = 0; i < 10; i++) {
      ai.learning.record({ channel: 1, timestamp: i, previous_level_db: -10, previous_fader: 0.75, new_fader: 0.74 });
    }
    expect(ai.learning.channelStats(1)).toMatchObject({ response_style: 'conservative', has_learned_behavior: true });
    expect(ai.learning.shape(1, { delta: -6, urgency: 'high' })).toEqual({ delta: -3, urgency: 'medium' });
  });

  it('round-trips through the v1.0 file format', () => {
    const ai = new AIController();
    ai.learning.record({ channel: 2, timestamp: 1, previous_level_db: -10, previous_fader: 0.75, new_fader: 0.5 });
    ai.configureChannel({ channel: 2, max_threshold_db: -9 });
    const file = JSON.parse(JSON.stringify(ai.learning.toFile(ai)));

    const restored = new AIController();
    restored.learning.loadFile(file, restored);
    expect(restored.learning.stats()).toEqual(ai.learning.stats());
    expect(restored.channelConfig(2).max_threshold_db).toBe(-9);
  });
});
