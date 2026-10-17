// Level math for Behringer X32 / X Air consoles.

/** Anything quieter than this is treated as silence. */
export const SILENCE_DB = -60;

export function linearToDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

/**
 * Fader position (0..1) to dB, using the consoles' own piecewise-linear fader law:
 * 0.75 = 0 dB, 1.0 = +10 dB, 0.5 = -10 dB, 0.25 = -30 dB, 0.0625 = -60 dB, 0 = -inf.
 */
export function faderToDb(f: number): number {
  if (f <= 0) return -Infinity;
  if (f >= 0.5) return f * 40 - 30;
  if (f >= 0.25) return f * 80 - 50;
  if (f >= 0.0625) return f * 160 - 70;
  return f * 480 - 90;
}

export function dbToFader(db: number): number {
  if (db <= -90) return 0;
  let f: number;
  if (db >= -10) f = (db + 30) / 40;
  else if (db >= -30) f = (db + 50) / 80;
  else if (db >= -60) f = (db + 70) / 160;
  else f = (db + 90) / 480;
  return Math.min(1, Math.max(0, f));
}

/**
 * Decodes the blob carried by a `/meters/N` message into dB values.
 *
 * Layout (little-endian): int32 value count, then the values. X Air sends int16
 * values in 1/256 dB; X32/M32 send float32 linear values. The value width is derived
 * from the blob size, so both families go through the same code.
 */
export function parseMeterBlob(blob: Buffer): number[] {
  if (blob.length < 4) return [];
  const count = blob.readInt32LE(0);
  if (count <= 0) return [];

  const width = (blob.length - 4) / count;
  const values: number[] = new Array(count);

  if (width >= 4) {
    for (let i = 0; i < count; i++) values[i] = linearToDb(blob.readFloatLE(4 + i * 4));
  } else if (width >= 2) {
    for (let i = 0; i < count; i++) values[i] = blob.readInt16LE(4 + i * 2) / 256;
  } else {
    return [];
  }

  return values.map((db) => (Number.isFinite(db) ? db : -Infinity));
}
