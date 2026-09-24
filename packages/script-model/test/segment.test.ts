import { ChunkMode } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { countWords, DEFAULT_TUNING, parseScript, segment, segmentText } from '../src/index.ts';
import { counter, texts } from './helpers.ts';

function pieces(text: string, mode: ChunkMode): string[] {
  const cuts = segmentText(text, mode);
  return cuts.map((cut, index) => text.slice(cut, cuts[index + 1] ?? text.length).trim());
}

const PARAGRAPH =
  'Welcome back to the channel, everyone. Today, we are going to build a small wooden shelf that fits in any corner of your room, step by step, with only three tools. Ready? Let us go.';

describe('segmentation modes', () => {
  it('T3: paragraph mode is one chunk per spoken block', () => {
    expect(pieces(PARAGRAPH, ChunkMode.Paragraph)).toEqual([PARAGRAPH]);
  });

  it('T3: sentence mode follows Intl.Segmenter and does not split at abbreviations or initials', () => {
    expect(pieces('Dr. Smith met Mr. J. Doe, e.g. at noon. It went well! Did it?', ChunkMode.Sentence)).toEqual([
      'Dr. Smith met Mr. J. Doe, e.g. at noon.',
      'It went well!',
      'Did it?',
    ]);
  });

  it('T3: short mode makes breath groups of at most shortMaxWords, split at clause punctuation', () => {
    const result = pieces(PARAGRAPH, ChunkMode.Short);
    expect(result).toEqual([
      'Welcome back to the channel, everyone.',
      'Today, we are going to build a',
      'small wooden shelf that fits in',
      'any corner of your room, step by step,',
      'with only three tools.',
      'Ready?',
      'Let us go.',
    ]);
    for (const piece of result) {
      expect(countWords(piece)).toBeLessThanOrEqual(DEFAULT_TUNING.shortMaxWords);
    }
  });

  it('T3: smart mode keeps sentences whole up to smartMaxWords, splits long ones and merges tiny ones', () => {
    expect(pieces(PARAGRAPH, ChunkMode.Smart)).toEqual([
      'Welcome back to the channel, everyone.',
      'Today, we are going to build a small wooden shelf',
      'that fits in any corner of your room, step by step, with only three tools.',
      'Ready? Let us go.',
    ]);
    for (const piece of pieces(PARAGRAPH, ChunkMode.Smart)) {
      expect(countWords(piece)).toBeLessThanOrEqual(DEFAULT_TUNING.smartMaxWords);
    }
  });

  it('T3: a spaced dash is a clause break; a dash inside a token (now—then) is never cut', () => {
    expect(pieces('one two three four five — six seven eight', ChunkMode.Short)).toEqual([
      'one two three four five —',
      'six seven eight',
    ]);
    const joined = 'one two three four five six seven eight—nine ten eleven';
    expect(segmentText(joined, ChunkMode.Short).every((cut) => cut === 0 || /\s/.test(joined.charAt(cut - 1)))).toBe(true);
    // A tail under shortMinWords rejoins the previous group instead of standing alone.
    expect(pieces('one two three four five six — seven eight', ChunkMode.Short)).toHaveLength(1);
  });

  it('T3: every cut is a word start, in every mode', () => {
    for (const mode of Object.values(ChunkMode)) {
      for (const cut of segmentText(PARAGRAPH, mode)) {
        expect(cut === 0 || /\s/.test(PARAGRAPH.charAt(cut - 1))).toBe(true);
      }
    }
  });

  it('T3: chunks never cross paragraphs when segmenting', () => {
    const blocks = parseScript('One. Two.\n\nThree four.', { newId: counter('b') });
    const plan = segment(blocks, ChunkMode.Paragraph, { newId: counter('c') });
    expect(texts(plan)).toEqual(['One. Two.', 'Three four.']);
    expect(plan.chunks.every((chunk) => chunk.ranges.length === 1)).toBe(true);
  });
});
