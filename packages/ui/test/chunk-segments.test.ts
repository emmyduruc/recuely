import { ReadingState, type TextSpan } from '@repo/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chunkSegments, spansAreValid } from '../src/chunk-segments.ts';

/** Arbitrary text with valid word spans over its non-space runs. */
const textWithWords = fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 6 }).filter((s) => !/\s/.test(s)), fc.constantFrom(' ', '  ', ', ', ' — ', '\n')), { minLength: 1, maxLength: 12 }).map((parts) => {
  let text = '';
  const words: TextSpan[] = [];
  for (const [word, gap] of parts) {
    words.push({ charStart: text.length, charEnd: text.length + word.length });
    text += word + gap;
  }
  return { text, words };
});

describe('chunkSegments', () => {
  it('T11: segments always concatenate to the exact chunk text (§A6.5)', () => {
    fc.assert(
      fc.property(textWithWords, fc.constantFrom(...Object.values(ReadingState)), fc.nat(15), ({ text, words }, state, current) => {
        const segments = chunkSegments(text, words, state, current);
        expect(segments?.map((s) => s.text).join('')).toBe(text);
        expect(segments?.filter((s) => s.word !== null)).toHaveLength(words.length);
      }),
    );
  });

  it('T11: at most one current word, and words before it are spoken', () => {
    fc.assert(
      fc.property(textWithWords, fc.nat(15), ({ text, words }, current) => {
        const segments = chunkSegments(text, words, ReadingState.Current, current) ?? [];
        const wordSegments = segments.filter((s) => s.word !== null);
        expect(wordSegments.filter((s) => s.state === ReadingState.Current).length).toBeLessThanOrEqual(1);
        for (const s of wordSegments) {
          const index = s.word ?? 0;
          if (index < current) expect(s.state).toBe(ReadingState.Spoken);
          else expect(s.state).toBe(index === current ? ReadingState.Current : ReadingState.Upcoming);
        }
      }),
    );
  });

  it('T11: a chunk that is not current gives every segment its own state', () => {
    const text = 'one two';
    const words: TextSpan[] = [{ charStart: 0, charEnd: 3 }, { charStart: 4, charEnd: 7 }];
    expect(chunkSegments(text, words, ReadingState.Spoken, 1)?.every((s) => s.state === ReadingState.Spoken)).toBe(true);
    expect(chunkSegments(text, words, ReadingState.Upcoming, null)?.every((s) => s.state === ReadingState.Upcoming)).toBe(true);
  });

  it('T11: rejects empty, overlapping, out-of-order and out-of-range spans', () => {
    const text = 'one two';
    expect(chunkSegments(text, [], ReadingState.Current, 0)).toBeNull();
    expect(spansAreValid(text, [{ charStart: 2, charEnd: 2 }])).toBe(false);
    expect(spansAreValid(text, [{ charStart: 0, charEnd: 5 }, { charStart: 4, charEnd: 7 }])).toBe(false);
    expect(spansAreValid(text, [{ charStart: 4, charEnd: 7 }, { charStart: 0, charEnd: 3 }])).toBe(false);
    expect(spansAreValid(text, [{ charStart: 4, charEnd: 8 }])).toBe(false);
    expect(spansAreValid(text, [{ charStart: 0.5, charEnd: 3 }])).toBe(false);
  });
});
