import dgram from 'node:dgram';
import os from 'node:os';
import type { DiscoveredMixer, LinkState, MixerInfo } from '../../../shared/types';
import { parseMeterBlob } from '../audio';
import { decodePacket, encodeMessage, float, int, str, type OscArg, type OscMessage } from '../osc';
import { assertChannel, assertFader, type AdapterEvents, type ChannelState, type MixerAdapter } from './types';

type Family = 'xair' | 'x32';

interface ModelSpec {
  name: string;
  family: Family;
  channels: number;
  buses: number;
}

export const MODELS: Record<'xr18' | 'x32' | 'm32', ModelSpec> = {
  xr18: { name: 'Behringer XR18', family: 'xair', channels: 16, buses: 6 },
  x32: { name: 'Behringer X32', family: 'x32', channels: 32, buses: 16 },
  m32: { name: 'Midas M32', family: 'x32', channels: 32, buses: 16 },
};

export const DEFAULT_PORTS: Record<Family, number> = { xair: 10024, x32: 10023 };

/** Maps the model string a console reports in its /xinfo reply to its layout. */
export function specFromReportedModel(model: string): Omit<ModelSpec, 'name'> | null {
  const m = model.toUpperCase();
  if (/^(XR|MR)12/.test(m)) return { family: 'xair', channels: 12, buses: 4 };
  if (/^(XR|MR)16/.test(m)) return { family: 'xair', channels: 16, buses: 4 };
  if (/^(XR|MR)18/.test(m)) return { family: 'xair', channels: 16, buses: 6 };
  if (/^(X32|M32)/.test(m)) return { family: 'x32', channels: 32, buses: 16 };
  return null;
}

// Both families drop /xremote and /meters subscriptions after 10 s without renewal.
const RENEW_MS = 8000;
const HANDSHAKE_TIMEOUT_MS = 2500;
const PING_AFTER_MS = 2000;
const LOST_AFTER_MS = 4500;
const ECHO_WINDOW_MS = 1500;

export interface BehringerOptions {
  model: keyof typeof MODELS;
  ip: string;
  port?: number;
}

export class BehringerAdapter implements MixerAdapter {
  readonly meterTap = null;
  info: MixerInfo;

  private socket: dgram.Socket | null = null;
  private linkState: LinkState = 'disconnected';
  private lastRx = 0;
  private timers: NodeJS.Timeout[] = [];
  private onXinfo: ((args: OscArg[]) => void) | null = null;

  private levels = new Map<number, number>();
  private faders = new Map<number, number>();
  private mutes = new Map<number, boolean>();
  private names = new Map<number, string>();
  private lastSentFader = new Map<number, { value: number; at: number }>();

  constructor(
    options: BehringerOptions,
    private readonly events: AdapterEvents = {},
  ) {
    const spec = MODELS[options.model];
    if (!spec) throw new Error(`Unknown mixer model: ${options.model}`);
    this.info = {
      name: spec.name,
      model: options.model.toUpperCase(),
      ip: options.ip,
      port: options.port ?? DEFAULT_PORTS[spec.family],
      channels: spec.channels,
      buses: spec.buses,
    };
  }

  link(): LinkState {
    return this.linkState;
  }

  async connect(): Promise<MixerInfo> {
    // One socket for sending and receiving: the console replies to the source port.
    const socket = dgram.createSocket('udp4');
    this.socket = socket;
    socket.on('message', (buf) => this.handlePacket(buf));
    socket.on('error', (err) => console.error('[mixer] socket error:', err.message));
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(0, () => {
        socket.off('error', reject);
        resolve();
      });
    });

    let xinfo: OscArg[];
    try {
      xinfo = await this.handshake();
    } catch (err) {
      await this.disconnect();
      throw err;
    }

    const [, name, model, firmware] = xinfo.map((a) => (a.type === 's' ? a.value : ''));
    const reported = model ? specFromReportedModel(model) : null;
    if (reported) {
      this.info = { ...this.info, channels: reported.channels, buses: reported.buses };
    }
    this.info = {
      ...this.info,
      name: name || this.info.name,
      model: model || this.info.model,
      firmware: firmware || undefined,
    };

    this.setLink('connected');
    this.subscribe();
    this.requestState();
    this.timers.push(
      setInterval(() => this.subscribe(), RENEW_MS),
      setInterval(() => this.watchdog(), 1000),
    );
    return this.info;
  }

  async disconnect(): Promise<void> {
    this.timers.forEach(clearInterval);
    this.timers = [];
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        this.sendTo(socket, '/unsubscribe');
      } catch {
        // socket may already be unusable
      }
      await new Promise<void>((resolve) => socket.close(() => resolve()));
    }
    this.setLink('disconnected');
  }

  getChannels(): ChannelState[] {
    const channels: ChannelState[] = [];
    for (let ch = 1; ch <= this.info.channels; ch++) {
      channels.push({
        channel: ch,
        name: this.names.get(ch) || `CH ${String(ch).padStart(2, '0')}`,
        level_db: this.levels.get(ch) ?? -Infinity,
        fader_value: this.faders.get(ch) ?? 0.75,
        muted: this.mutes.get(ch) ?? false,
      });
    }
    return channels;
  }

  setFader(channel: number, value: number): void {
    assertChannel(channel, this.info.channels);
    assertFader(value);
    this.send(`${channelPath(channel)}/mix/fader`, [float(value)]);
    this.faders.set(channel, value);
    this.lastSentFader.set(channel, { value, at: Date.now() });
  }

  setMute(channel: number, mute: boolean): void {
    assertChannel(channel, this.info.channels);
    // mix/on: 1 = channel on (unmuted), 0 = muted
    this.send(`${channelPath(channel)}/mix/on`, [int(mute ? 0 : 1)]);
    this.mutes.set(channel, mute);
  }

  private handshake(): Promise<OscArg[]> {
    return new Promise((resolve, reject) => {
      const retry = setInterval(() => this.send('/xinfo'), 700);
      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `No response from ${this.info.ip}:${this.info.port}. Check the IP address, ` +
              `that this computer is on the mixer's network, and the firewall (UDP).`,
          ),
        );
      }, HANDSHAKE_TIMEOUT_MS);
      const cleanup = () => {
        clearInterval(retry);
        clearTimeout(timeout);
        this.onXinfo = null;
      };
      this.onXinfo = (args) => {
        cleanup();
        resolve(args);
      };
      this.send('/xinfo');
    });
  }

  private subscribe(): void {
    this.send('/xremote');
    this.send('/meters', [str('/meters/1')]);
  }

  /** Asks the console for every channel's fader, mute and name. */
  private requestState(): void {
    for (let ch = 1; ch <= this.info.channels; ch++) {
      const path = channelPath(ch);
      this.send(`${path}/mix/fader`);
      this.send(`${path}/mix/on`);
      this.send(`${path}/config/name`);
    }
  }

  private watchdog(): void {
    const quiet = Date.now() - this.lastRx;
    if (quiet > LOST_AFTER_MS) this.setLink('lost');
    if (quiet > PING_AFTER_MS) this.send('/xinfo');
  }

  private setLink(state: LinkState): void {
    if (state === this.linkState) return;
    this.linkState = state;
    this.events.link?.(state);
  }

  private handlePacket(buf: Buffer): void {
    let messages: OscMessage[];
    try {
      messages = decodePacket(buf);
    } catch (err) {
      console.warn('[mixer] dropped malformed packet:', (err as Error).message);
      return;
    }

    this.lastRx = Date.now();
    if (this.linkState === 'lost') {
      this.setLink('connected');
      this.subscribe();
      this.requestState();
    }

    for (const msg of messages) this.handleMessage(msg);
  }

  private handleMessage({ address, args }: OscMessage): void {
    if (address === '/xinfo') {
      this.onXinfo?.(args);
      return;
    }

    if (address === '/meters/1') {
      const blob = args[0];
      if (blob?.type !== 'b') return;
      const values = parseMeterBlob(blob.value);
      for (let ch = 1; ch <= this.info.channels && ch <= values.length; ch++) {
        this.levels.set(ch, values[ch - 1]);
      }
      return;
    }

    const match = /^\/ch\/(\d{2})\/(mix\/fader|mix\/on|config\/name)$/.exec(address);
    if (!match || args.length === 0) return;
    const channel = Number(match[1]);
    if (channel < 1 || channel > this.info.channels) return;
    const arg = args[0];

    switch (match[2]) {
      case 'mix/fader':
        if (arg.type === 'f' && arg.value >= 0 && arg.value <= 1) this.updateFader(channel, arg.value);
        break;
      case 'mix/on':
        if (arg.type === 'i') this.mutes.set(channel, arg.value === 0);
        break;
      case 'config/name':
        if (arg.type === 's') this.names.set(channel, arg.value.slice(0, 32));
        break;
    }
  }

  private updateFader(channel: number, value: number): void {
    const previous = this.faders.get(channel);
    this.faders.set(channel, value);

    // The first value is just the console answering our state request.
    if (previous === undefined || Math.abs(previous - value) < 0.002) return;

    const sent = this.lastSentFader.get(channel);
    const isEcho = sent && Math.abs(sent.value - value) < 0.002 && Date.now() - sent.at < ECHO_WINDOW_MS;
    if (!isEcho) this.events.externalFader?.(channel, value);
  }

  private send(address: string, args: OscArg[] = []): void {
    if (this.socket) this.sendTo(this.socket, address, args);
  }

  private sendTo(socket: dgram.Socket, address: string, args: OscArg[] = []): void {
    socket.send(encodeMessage(address, args), this.info.port, this.info.ip, (err) => {
      if (err) console.error(`[mixer] send ${address} failed:`, err.message);
    });
  }
}

function channelPath(channel: number): string {
  return `/ch/${String(channel).padStart(2, '0')}`;
}

/** Broadcast addresses of every active IPv4 interface (WiFi and wired alike). */
function broadcastAddresses(): string[] {
  const addresses = new Set<string>(['255.255.255.255']);
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const ip = addr.address.split('.').map(Number);
      const mask = addr.netmask.split('.').map(Number);
      addresses.add(ip.map((octet, i) => (octet | (~mask[i] & 255)) >>> 0).join('.'));
    }
  }
  return [...addresses];
}

/** Finds X32/X Air consoles on the local networks by broadcasting /xinfo. */
export async function discoverMixers(timeoutMs = 1500): Promise<DiscoveredMixer[]> {
  const socket = dgram.createSocket('udp4');
  const found = new Map<string, DiscoveredMixer>();

  socket.on('message', (buf, rinfo) => {
    try {
      for (const { address, args } of decodePacket(buf)) {
        if (address !== '/xinfo') continue;
        const [, name, model, firmware] = args.map((a) => (a.type === 's' ? a.value : ''));
        found.set(rinfo.address, { ip: rinfo.address, port: rinfo.port, name, model, firmware });
      }
    } catch {
      // not an OSC reply
    }
  });

  await new Promise<void>((resolve) => socket.bind(0, () => resolve()));
  socket.setBroadcast(true);

  const probe = encodeMessage('/xinfo');
  for (const address of broadcastAddresses()) {
    for (const port of Object.values(DEFAULT_PORTS)) {
      socket.send(probe, port, address, () => {
        // unreachable interfaces are expected; ignore
      });
    }
  }

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return [...found.values()];
}
