import { describe, expect, it } from 'vitest';
import { dbToFader, faderToDb, parseMeterBlob } from './audio';

describe('fader law', () => {
  it.each([
    [1, 10],
    [0.75, 0],
    [0.5, -10],
    [0.25, -30],
    [0.0625, -60],
  ])('fader %d = %d dB', (fader, dB) => {
    expect(faderToDb(fader)).toBeCloseTo(dB, 6);
    expect(dbToFader(dB)).toBeCloseTo(fader, 6);
  });

  it('treats a closed fader as -inf', () => {
    expect(faderToDb(0)).toBe(-Infinity);
    expect(dbToFader(-Infinity)).toBe(0);
  });

  it('round-trips across the whole travel', () => {
    for (let f = 0.01; f <= 1; f += 0.01) expect(dbToFader(faderToDb(f))).toBeCloseTo(f, 6);
  });
});

describe('parseMeterBlob', () => {
  it('reads X Air meters (int16, 1/256 dB)', () => {
    const blob = Buffer.alloc(4 + 3 * 2);
    blob.writeInt32LE(3, 0);
    blob.writeInt16LE(-12 * 256, 4);
    blob.writeInt16LE(0, 6);
    blob.writeInt16LE(-32768, 8);
    expect(parseMeterBlob(blob)).toEqual([-12, 0, -128]);
  });

  it('reads X32 meters (float32 linear)', () => {
    const blob = Buffer.alloc(4 + 3 * 4);
    blob.writeInt32LE(3, 0);
    blob.writeFloatLE(1, 4);
    blob.writeFloatLE(0.5, 8);
    blob.writeFloatLE(0, 12);
    const [a, b, c] = parseMeterBlob(blob);
    expect(a).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(-6.02, 2);
    expect(c).toBe(-Infinity);
  });

  it('ignores truncated blobs', () => {
    expect(parseMeterBlob(Buffer.alloc(2))).toEqual([]);
  });
});
