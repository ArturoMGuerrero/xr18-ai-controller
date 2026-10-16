// Minimal OSC 1.0 encoder/decoder: just what Behringer X32/X Air consoles speak.
// Supported argument types: i (int32), f (float32), s (string), b (blob).

export type OscArg =
  | { type: 'i'; value: number }
  | { type: 'f'; value: number }
  | { type: 's'; value: string }
  | { type: 'b'; value: Buffer };

export interface OscMessage {
  address: string;
  args: OscArg[];
}

export const int = (value: number): OscArg => ({ type: 'i', value });
export const float = (value: number): OscArg => ({ type: 'f', value });
export const str = (value: string): OscArg => ({ type: 's', value });

const pad4 = (n: number) => (n + 3) & ~3;

function encodeString(s: string): Buffer {
  const raw = Buffer.from(s, 'utf8');
  const out = Buffer.alloc(pad4(raw.length + 1));
  raw.copy(out);
  return out;
}

export function encodeMessage(address: string, args: OscArg[] = []): Buffer {
  const parts: Buffer[] = [encodeString(address), encodeString(',' + args.map((a) => a.type).join(''))];

  for (const arg of args) {
    switch (arg.type) {
      case 'i': {
        const b = Buffer.alloc(4);
        b.writeInt32BE(arg.value | 0);
        parts.push(b);
        break;
      }
      case 'f': {
        const b = Buffer.alloc(4);
        b.writeFloatBE(arg.value);
        parts.push(b);
        break;
      }
      case 's':
        parts.push(encodeString(arg.value));
        break;
      case 'b': {
        const b = Buffer.alloc(4 + pad4(arg.value.length));
        b.writeInt32BE(arg.value.length);
        arg.value.copy(b, 4);
        parts.push(b);
        break;
      }
    }
  }

  return Buffer.concat(parts);
}

function readString(buf: Buffer, offset: number): [string, number] {
  const end = buf.indexOf(0, offset);
  if (end === -1) throw new Error('Unterminated OSC string');
  return [buf.toString('utf8', offset, end), pad4(end + 1)];
}

/** Decodes a packet; bundles are flattened into their messages. */
export function decodePacket(buf: Buffer): OscMessage[] {
  if (buf.length >= 8 && buf.toString('ascii', 0, 8) === '#bundle\0') {
    const messages: OscMessage[] = [];
    let offset = 16; // "#bundle\0" + 8-byte timetag
    while (offset + 4 <= buf.length) {
      const size = buf.readInt32BE(offset);
      offset += 4;
      messages.push(...decodePacket(buf.subarray(offset, offset + size)));
      offset += size;
    }
    return messages;
  }

  let offset = 0;
  const [address, afterAddress] = readString(buf, offset);
  offset = afterAddress;
  if (!address.startsWith('/')) throw new Error(`Invalid OSC address: ${address}`);

  if (offset >= buf.length) return [{ address, args: [] }];

  const [tags, afterTags] = readString(buf, offset);
  offset = afterTags;
  if (!tags.startsWith(',')) throw new Error('Missing OSC type tags');

  const args: OscArg[] = [];
  for (const tag of tags.slice(1)) {
    switch (tag) {
      case 'i':
        args.push({ type: 'i', value: buf.readInt32BE(offset) });
        offset += 4;
        break;
      case 'f':
        args.push({ type: 'f', value: buf.readFloatBE(offset) });
        offset += 4;
        break;
      case 's': {
        const [value, next] = readString(buf, offset);
        args.push({ type: 's', value });
        offset = next;
        break;
      }
      case 'b': {
        const size = buf.readInt32BE(offset);
        args.push({ type: 'b', value: buf.subarray(offset + 4, offset + 4 + size) });
        offset += 4 + pad4(size);
        break;
      }
      default:
        throw new Error(`Unsupported OSC type tag: ${tag}`);
    }
  }

  return [{ address, args }];
}
