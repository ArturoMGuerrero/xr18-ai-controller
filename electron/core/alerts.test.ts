import { describe, expect, it } from 'vitest';
import type { ChannelStats } from '../../shared/types';
import { AlertEngine } from './alerts';

const stats = (s: Partial<ChannelStats>): ChannelStats => ({
  samples: 100, avg_db: null, max_db: null, min_db: null, std_dev: null, recent_peak: null, ...s,
});

describe('AlertEngine', () => {
  it('flags clipping after consecutive hot samples, then cools down', () => {
    const engine = new AlertEngine();
    expect(engine.check(1, -1, null, 0)).toEqual([]);
    expect(engine.check(1, -1, null, 50)).toEqual([]);
    expect(engine.check(1, -1, null, 100).map((a) => a.type)).toEqual(['clipping_risk']);
    expect(engine.check(1, -1, null, 150)).toEqual([]); // cooldown
    expect(engine.check(1, -1, null, 31_000).map((a) => a.type)).toEqual(['clipping_risk']);
  });

  it('measures low signal in time, independent of the history window', () => {
    const engine = new AlertEngine();
    const low = stats({ avg_db: -50, std_dev: 5 });
    for (let t = 0; t < 10_000; t += 50) expect(engine.check(1, -50, low, t)).toEqual([]);
    expect(engine.check(1, -50, low, 10_000).map((a) => a.type)).toEqual(['low_signal']);
  });

  it('detects a signal dropping to silence, not normal transients', () => {
    const engine = new AlertEngine();
    for (let t = 0; t < 1000; t += 50) engine.check(2, t % 100 ? -30 : -12, null, t);
    expect(engine.check(2, -40, null, 1000)).toEqual([]); // drum decay
    expect(engine.check(2, -90, null, 1050).map((a) => a.type)).toEqual(['sudden_drop']);
  });
});
