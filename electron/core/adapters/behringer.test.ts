import dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { decodePacket, encodeMessage, float, int, str, type OscMessage } from '../osc';
import { BehringerAdapter } from './behringer';

/** A fake XR18 on localhost that speaks real OSC over UDP, replying to the sender's port. */
async function fakeXr18() {
  const socket = dgram.createSocket('udp4');
  const received: OscMessage[] = [];
  let meterTimer: NodeJS.Timeout | null = null;
  let client: { address: string; port: number } | null = null;
  const faders: Record<number, number> = { 1: 0.5 };

  const reply = (address: string, args: Parameters<typeof encodeMessage>[1] = []) => {
    if (client) socket.send(encodeMessage(address, args), client.port, client.address);
  };

  socket.on('message', (buf, rinfo) => {
    client = { address: rinfo.address, port: rinfo.port };
    for (const msg of decodePacket(buf)) {
      received.push(msg);
      const fader = /^\/ch\/(\d\d)\/mix\/fader$/.exec(msg.address);
      if (msg.address === '/xinfo') {
        reply('/xinfo', [str('127.0.0.1'), str('Stage XR'), str('XR18'), str('1.22')]);
      } else if (msg.address === '/meters' && !meterTimer) {
        meterTimer = setInterval(() => {
          const blob = Buffer.alloc(4 + 40 * 2);
          blob.writeInt32LE(40, 0);
          blob.writeInt16LE(-12 * 256, 4); // channel 1 at -12 dB
          for (let i = 1; i < 40; i++) blob.writeInt16LE(-90 * 256, 4 + i * 2);
          reply('/meters/1', [{ type: 'b', value: blob }]);
        }, 20);
      } else if (fader && msg.args.length === 0) {
        reply(msg.address, [float(faders[Number(fader[1])] ?? 0.75)]);
      } else if (msg.address === '/ch/02/mix/on' && msg.args.length === 0) {
        reply(msg.address, [int(0)]);
      } else if (msg.address === '/ch/01/config/name' && msg.args.length === 0) {
        reply(msg.address, [str('Kick')]);
      }
    }
  });

  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', () => resolve()));

  return {
    port: socket.address().port,
    received,
    reply,
    close: () => {
      if (meterTimer) clearInterval(meterTimer);
      socket.close();
    },
  };
}

const waitFor = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('BehringerAdapter (against a fake console over UDP)', () => {
  const cleanup: (() => unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.splice(0)) await fn();
  });

  it('handshakes, subscribes, reads meters and state', async () => {
    const mixer = await fakeXr18();
    cleanup.push(mixer.close);
    const adapter = new BehringerAdapter({ model: 'xr18', ip: '127.0.0.1', port: mixer.port });
    cleanup.push(() => adapter.disconnect());

    const info = await adapter.connect();
    expect(info).toMatchObject({ name: 'Stage XR', model: 'XR18', channels: 16, firmware: '1.22' });
    expect(adapter.link()).toBe('connected');

    await waitFor(() => adapter.getChannels()[0].level_db === -12);
    await waitFor(() => adapter.getChannels()[1].muted);
    const [ch1] = adapter.getChannels();
    expect(ch1).toMatchObject({ name: 'Kick', fader_value: 0.5, level_db: -12 });

    const meterRequest = mixer.received.find((m) => m.address === '/meters');
    expect(meterRequest?.args).toEqual([{ type: 's', value: '/meters/1' }]);
    expect(mixer.received.some((m) => m.address === '/xremote')).toBe(true);
  });

  it('sends faders and mutes in the format the console expects', async () => {
    const mixer = await fakeXr18();
    cleanup.push(mixer.close);
    const adapter = new BehringerAdapter({ model: 'xr18', ip: '127.0.0.1', port: mixer.port });
    cleanup.push(() => adapter.disconnect());
    await adapter.connect();

    adapter.setFader(2, 0.6);
    adapter.setMute(3, true);
    await waitFor(() => mixer.received.some((m) => m.address === '/ch/03/mix/on' && m.args.length > 0));

    const fader = mixer.received.find((m) => m.address === '/ch/02/mix/fader' && m.args.length > 0);
    expect(fader?.args[0].type).toBe('f');
    expect(fader?.args[0].value).toBeCloseTo(0.6, 5);
    expect(mixer.received.find((m) => m.address === '/ch/03/mix/on' && m.args.length > 0)?.args).toEqual([
      { type: 'i', value: 0 },
    ]);
    expect(() => adapter.setFader(17, 0.5)).toThrow();
    expect(() => adapter.setFader(1, 1.5)).toThrow();
  });

  it('reports fader moves made on the desk, but not its own echoes', async () => {
    const mixer = await fakeXr18();
    cleanup.push(mixer.close);
    const moves: [number, number][] = [];
    const adapter = new BehringerAdapter(
      { model: 'xr18', ip: '127.0.0.1', port: mixer.port },
      { externalFader: (ch, v) => moves.push([ch, v]) },
    );
    cleanup.push(() => adapter.disconnect());
    await adapter.connect();
    await waitFor(() => adapter.getChannels()[0].fader_value === 0.5);

    adapter.setFader(1, 0.6);
    mixer.reply('/ch/01/mix/fader', [float(0.6)]); // echo of our own move
    mixer.reply('/ch/04/mix/fader', [float(0.3)]); // engineer moved ch 4 on the desk
    await waitFor(() => moves.length > 0);
    await new Promise((r) => setTimeout(r, 50));

    expect(moves).toHaveLength(1);
    expect(moves[0][0]).toBe(4);
    expect(moves[0][1]).toBeCloseTo(0.3, 5);
  });

  it('fails clearly when nothing answers', async () => {
    const silent = dgram.createSocket('udp4');
    await new Promise<void>((resolve) => silent.bind(0, '127.0.0.1', () => resolve()));
    cleanup.push(() => silent.close());

    const adapter = new BehringerAdapter({ model: 'xr18', ip: '127.0.0.1', port: silent.address().port });
    await expect(adapter.connect()).rejects.toThrow(/No response/);
    expect(adapter.link()).toBe('disconnected');
  }, 5000);
});
