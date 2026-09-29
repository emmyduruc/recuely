/** Builds silent MPEG-2 Layer III frames (24 kHz, 32 kbit/s mono): 96 bytes and 24 ms each. */
export function mp3Frames(count: number): Buffer {
  const frame = Buffer.alloc(96);
  frame.set([0xff, 0xf3, 0x44, 0xc4]);
  return Buffer.concat(Array.from({ length: count }, () => frame));
}

export const MS_PER_TEST_FRAME = 24;
