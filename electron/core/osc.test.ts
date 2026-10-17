import { describe, expect, it } from 'vitest';
import { decodePacket, encodeMessage, float, int, str } from './osc';

describe('osc', () => {
  it('round-trips messages with every supported type', () => {
    const blob = Buffer.from([1, 2, 3, 4, 5]);
    const buf = encodeMessage('/ch/01/mix/fader', [float(0.75), int(-3), str('hello'), { type: 'b', value: blob }]);
    expect(buf.length % 4).toBe(0);

    const [msg] = decodePacket(buf);
    expect(msg.address).toBe('/ch/01/mix/fader');
    expect(msg.args[0]).toEqual({ type: 'f', value: 0.75 });
    expect(msg.args[1]).toEqual({ type: 'i', value: -3 });
    expect(msg.args[2]).toEqual({ type: 's', value: 'hello' });
    expect(Buffer.compare(msg.args[3].value as Buffer, blob)).toBe(0);
  });

  it('encodes the exact bytes consoles expect for /xinfo', () => {
    expect(encodeMessage('/xinfo').toString('hex')).toBe(
      Buffer.from('/xinfo\0\0,\0\0\0', 'binary').toString('hex'),
    );
  });

  it('decodes messages without a type tag string', () => {
    const buf = Buffer.from('/xremote\0\0\0\0', 'binary');
    expect(decodePacket(buf)).toEqual([{ address: '/xremote', args: [] }]);
  });

  it('flattens bundles', () => {
    const a = encodeMessage('/a', [int(1)]);
    const b = encodeMessage('/b', [int(2)]);
    const header = Buffer.concat([Buffer.from('#bundle\0', 'binary'), Buffer.alloc(8)]);
    const size = (n: number) => {
      const s = Buffer.alloc(4);
      s.writeInt32BE(n);
      return s;
    };
    const bundle = Buffer.concat([header, size(a.length), a, size(b.length), b]);
    expect(decodePacket(bundle).map((m) => m.address)).toEqual(['/a', '/b']);
  });

  it('rejects garbage', () => {
    expect(() => decodePacket(Buffer.from('nope\0\0\0\0'))).toThrow();
  });
});
