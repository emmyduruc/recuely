import { randomBytes } from 'node:crypto';

const TIMESTAMP_BYTES = 6;
const RANDOM_BYTES = 10;

/**
 * RFC 9562 UUID version 7: 48-bit Unix-ms timestamp, then random bits.
 * Ids sort by creation time, which keeps B-tree inserts local (SPEC.md §B4).
 */
export function uuidv7(now: number = Date.now(), random: Uint8Array = randomBytes(RANDOM_BYTES)): string {
  if (random.length !== RANDOM_BYTES) {
    throw new RangeError(`uuidv7 needs ${String(RANDOM_BYTES)} random bytes`);
  }
  const bytes = new Uint8Array(TIMESTAMP_BYTES + RANDOM_BYTES);
  let timestamp = BigInt(now);
  for (let i = TIMESTAMP_BYTES - 1; i >= 0; i -= 1) {
    bytes[i] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes.set(random, TIMESTAMP_BYTES);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // RFC 9562 variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
