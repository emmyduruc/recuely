import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from '../src/uuid-v7.ts';

describe('uuidv7', () => {
  it('T1: produces an RFC 9562 version-7 UUID', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('T1: encodes the millisecond timestamp in the first 48 bits', () => {
    const now = Date.UTC(2026, 8, 24, 12, 0, 0);
    const id = uuidv7(now, new Uint8Array(10));
    expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(now);
  });

  it('T1: ids sort by creation time', () => {
    const ids = [3, 1, 2].map((offset) => uuidv7(1_700_000_000_000 + offset));
    expect([...ids].sort()).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('T1: rejects a random buffer of the wrong size', () => {
    expect(() => uuidv7(0, new Uint8Array(4))).toThrow(RangeError);
  });
});
