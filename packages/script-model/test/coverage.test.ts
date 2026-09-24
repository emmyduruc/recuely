import { ChunkMode, type ScriptChunk } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { assertCoverage, checkCoverage, CoverageError, CoverageIssueCode, parseScript, segment } from '../src/index.ts';
import { counter } from './helpers.ts';

const blocks = parseScript('One two three. Four five.\n\nSix seven.', { newId: counter('b') });
const plan = segment(blocks, ChunkMode.Sentence, { newId: counter('c') });

function codes(chunks: ScriptChunk[]): string[] {
  return checkCoverage(blocks, chunks).map((issue) => issue.code);
}

function withChunk(index: number, patch: Partial<ScriptChunk>): ScriptChunk[] {
  return plan.chunks.map((chunk, i) => (i === index ? { ...chunk, ...patch } : chunk));
}

describe('coverage check (SPEC.md §B5 rules 2–4)', () => {
  it('T3: a plan built by the package passes', () => {
    expect(checkCoverage(blocks, plan.chunks)).toEqual([]);
    expect(() => {
      assertCoverage(blocks, plan.chunks);
    }).not.toThrow();
  });

  it('T3: a dropped chunk leaves text uncovered and changes the wording', () => {
    expect(codes(plan.chunks.slice(1))).toEqual([CoverageIssueCode.Uncovered, CoverageIssueCode.WordingChanged]);
  });

  it('T3: overlapping chunks cover text twice', () => {
    const [first, second] = plan.chunks;
    const firstRange = first?.ranges[0];
    const secondRange = second?.ranges[0];
    if (firstRange === undefined || secondRange === undefined) {
      throw new Error('setup');
    }
    const widened = withChunk(1, { ranges: [{ ...secondRange, start: firstRange.start }] });
    expect(codes(widened)).toContain(CoverageIssueCode.CoveredTwice);
  });

  it('T3: a paraphrased chunk text is caught even when ranges are right', () => {
    expect(codes(withChunk(0, { text: 'One, two, three.' }))).toEqual([
      CoverageIssueCode.TextMismatch,
      CoverageIssueCode.SpokenTextMismatch,
      CoverageIssueCode.WordingChanged,
    ]);
  });

  it('T3: spokenText may not differ beyond whitespace and emphasis markers', () => {
    expect(codes(withChunk(0, { spokenText: 'One two 3.' }))).toEqual([CoverageIssueCode.SpokenTextMismatch]);
  });

  it('T3: unknown blocks, invalid ranges, empty chunks, bad order and duplicate ids are reported', () => {
    const first = plan.chunks[0];
    const last = plan.chunks.at(-1);
    if (first === undefined || last === undefined) {
      throw new Error('setup');
    }
    expect(codes(withChunk(0, { ranges: [{ blockId: 'ghost', start: 0, end: 3 }] }))).toContain(CoverageIssueCode.UnknownBlock);
    expect(codes(withChunk(0, { ranges: [{ ...first.ranges[0], blockId: first.ranges[0]?.blockId ?? '', start: 5, end: 2 }] }))).toContain(
      CoverageIssueCode.InvalidRange,
    );
    expect(codes(withChunk(0, { ranges: [] }))).toContain(CoverageIssueCode.EmptyChunk);
    expect(codes([last, ...plan.chunks.slice(0, -1)])).toContain(CoverageIssueCode.OutOfOrder);
    expect(codes(withChunk(1, { id: first.id }))).toContain(CoverageIssueCode.DuplicateId);
  });

  it('T3: assertCoverage throws a CoverageError listing the issues', () => {
    expect(() => {
      assertCoverage(blocks, []);
    }).toThrow(CoverageError);
  });
});
