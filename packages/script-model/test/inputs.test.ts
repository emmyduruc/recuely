import { BlockType, ChunkMode } from '@repo/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BlockInputIssue, buildBlocks, checkCoverage, chunksFromRanges, parseScript, segment } from '../src/index.ts';
import { counter } from './helpers.ts';

describe('server-side inputs (SPEC.md Task 4)', () => {
  it('T4: buildBlocks derives text from the source and keeps types, table and metadata', () => {
    const source = '# Intro\n\nHello there.';
    const result = buildBlocks(
      source,
      [
        { type: BlockType.Spoken, start: 2, end: 7, metadata: { marker: '# ' } },
        { type: BlockType.Spoken, start: 9, end: 21 },
      ],
      counter('b'),
    );
    expect(result).toEqual({
      ok: true,
      value: [
        { id: 'b1', order: 0, type: BlockType.Spoken, text: 'Intro', source: { start: 2, end: 7 }, metadata: { marker: '# ' } },
        { id: 'b2', order: 1, type: BlockType.Spoken, text: 'Hello there.', source: { start: 9, end: 21 }, metadata: {} },
      ],
    });
  });

  it('T4: buildBlocks rejects out-of-range, overlapping and blank ranges', () => {
    const result = buildBlocks(
      'abc  def',
      [
        { type: BlockType.Spoken, start: 0, end: 3 },
        { type: BlockType.Spoken, start: 2, end: 4 },
        { type: BlockType.Spoken, start: 3, end: 5 },
        { type: BlockType.Spoken, start: 6, end: 99 },
      ],
      counter('b'),
    );
    expect(result).toEqual({
      ok: false,
      issues: [
        { index: 1, issue: BlockInputIssue.Overlap },
        { index: 2, issue: BlockInputIssue.Overlap },
        { index: 2, issue: BlockInputIssue.Blank },
        { index: 3, issue: BlockInputIssue.OutOfRange },
      ],
    });
  });

  it('T4: chunksFromRanges ignores nothing but the ranges: text is rebuilt, a bad plan fails the coverage check', () => {
    const blocks = parseScript('One two. Three four.', { newId: counter('b') });
    const block = blocks[0];
    if (block === undefined) {
      throw new Error('setup');
    }
    const good = chunksFromRanges(blocks, [{ ranges: [{ blockId: block.id, start: 0, end: 8 }] }, { ranges: [{ blockId: block.id, start: 9, end: 20 }] }], counter('c'));
    expect(good.map((chunk) => [chunk.id, chunk.text])).toEqual([
      ['c1', 'One two.'],
      ['c2', 'Three four.'],
    ]);
    expect(checkCoverage(blocks, good)).toEqual([]);
    const gap = chunksFromRanges(blocks, [{ ranges: [{ blockId: block.id, start: 0, end: 8 }] }], counter('c'));
    expect(checkCoverage(blocks, gap).length).toBeGreaterThan(0);
  });

  it('T4: chunksFromRanges reproduces any segmented plan exactly from ids + ranges (1,000 cases)', () => {
    const words = fc.constantFrom('alpha', 'beta,', 'gamma.', 'Dr.', 'delta!', '**bold**', '[Scene 1]', '# Head');
    const source = fc.array(fc.array(words, { minLength: 1, maxLength: 12 }).map((w) => w.join(' ')), { minLength: 1, maxLength: 6 })
      .map((lines) => lines.join('\n\n'));
    fc.assert(
      fc.property(source, fc.constantFrom(...Object.values(ChunkMode)), (text, mode) => {
        const blocks = parseScript(text, { newId: counter('b') });
        const plan = segment(blocks, mode, { newId: counter('c') });
        const rebuilt = chunksFromRanges(blocks, plan.chunks.map(({ id, ranges }) => ({ id, ranges })), counter('x'));
        expect(rebuilt).toEqual(plan.chunks);
      }),
      { numRuns: 1000 },
    );
  });
});
