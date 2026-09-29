import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mp3DurationMs, mp3FrameAt } from '../../server/utils/speech/mp3';
import { mp3Frames, MS_PER_TEST_FRAME } from './mp3-frames';

describe('mp3 duration', () => {
  it('T10: a real OpenAI clip matches afinfo (2.208 s, 24 kHz MPEG-2 L3, 128 kbit/s)', () => {
    const clip = readFileSync(new URL('../fixtures/speech/openai-short.mp3', import.meta.url));
    expect(mp3FrameAt(clip, 0)).toEqual({ bytes: 384, samples: 576, sampleRate: 24000 });
    expect(mp3DurationMs(clip)).toBe(2208);
  });

  it('T10: counts synthetic frames, skipping an ID3v2 tag and garbage', () => {
    expect(mp3DurationMs(mp3Frames(25))).toBe(25 * MS_PER_TEST_FRAME);
    const id3 = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5]);
    expect(mp3DurationMs(Buffer.concat([id3, mp3Frames(10), Buffer.from([1, 2, 3]), mp3Frames(5)]))).toBe(15 * MS_PER_TEST_FRAME);
  });

  it('T10: no frames means no duration', () => {
    expect(mp3DurationMs(Buffer.from('not audio at all'))).toBeNull();
    expect(mp3DurationMs(Buffer.alloc(0))).toBeNull();
  });
});
