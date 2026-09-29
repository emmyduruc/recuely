import { BlockType, ChunkMode } from '@repo/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BoundaryStep,
  checkCoverage,
  nudgeBoundary,
  parseScript,
  ScriptEditError,
  segment,
  setSpokenColumn,
  tablesOf,
} from '../src/index.ts';
import { counter, readScriptFixture, texts, unwrap } from './helpers.ts';

// Helpers for the Task 12 review UI: keyboard boundary moves and the table column picker.

describe('nudgeBoundary', () => {
  const blocks = parseScript('One two three. Four five six.', { newId: counter('b') });
  const plan = segment(blocks, ChunkMode.Sentence, { newId: counter('c') });
  const second = plan.chunks[1]?.id ?? '';

  it('T12: moves a boundary one word earlier or later', () => {
    expect(texts(unwrap(nudgeBoundary(blocks, plan, second, BoundaryStep.Earlier, counter('n'))))).toEqual([
      'One two',
      'three. Four five six.',
    ]);
    expect(texts(unwrap(nudgeBoundary(blocks, plan, second, BoundaryStep.Later, counter('n'))))).toEqual([
      'One two three. Four',
      'five six.',
    ]);
  });

  it('T12: never empties a neighbour and refuses the first chunk', () => {
    let current = plan;
    for (let i = 0; i < 2; i += 1) current = unwrap(nudgeBoundary(blocks, current, current.chunks[1]?.id ?? '', BoundaryStep.Later, counter(`m${String(i)}`)));
    expect(texts(current)).toEqual(['One two three. Four five', 'six.']);
    expect(nudgeBoundary(blocks, current, current.chunks[1]?.id ?? '', BoundaryStep.Later, counter('x'))).toEqual({
      ok: false,
      error: ScriptEditError.OutsideChunk,
    });
    expect(nudgeBoundary(blocks, plan, plan.chunks[0]?.id ?? '', BoundaryStep.Earlier, counter('x'))).toEqual({
      ok: false,
      error: ScriptEditError.FirstChunk,
    });
  });

  it('T12: random nudges keep coverage (property, 1,000 runs)', () => {
    const source = readScriptFixture('e1-mixed.md');
    const e1 = parseScript(source, { newId: counter('b') });
    const start = segment(e1, ChunkMode.Short, { newId: counter('c') });
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(40), fc.boolean()), { maxLength: 25 }), (steps) => {
        let current = start;
        const newId = counter('p');
        for (const [pick, later] of steps) {
          const chunk = current.chunks[pick % current.chunks.length];
          const result = nudgeBoundary(e1, current, chunk?.id ?? '', later ? BoundaryStep.Later : BoundaryStep.Earlier, newId);
          if (result.ok) current = result.value;
        }
        expect(checkCoverage(e1, current.chunks)).toEqual([]);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('table column picker', () => {
  const blocks = parseScript(readScriptFixture('e1-mixed.md'), { newId: counter('b') });

  it('T12: lists the table with its columns and detects the spoken one', () => {
    expect(tablesOf(blocks)).toEqual([
      {
        index: 0,
        columns: [
          { column: 0, header: 'Time' },
          { column: 1, header: 'Visual' },
          { column: 2, header: 'Line' },
        ],
        spokenColumn: 2,
      },
    ]);
  });

  it('T12: choosing a column makes its body cells spoken and the others notes; headers untouched', () => {
    const visual = unwrap(setSpokenColumn(blocks, 0, 1));
    const cells = visual.filter((block) => block.source.table !== undefined);
    expect(cells.map((cell) => [cell.text, cell.type])).toEqual([
      ['Time', BlockType.Heading],
      ['Visual', BlockType.Heading],
      ['Line', BlockType.Heading],
      ['0:05', BlockType.Note],
      ['Close-up of the box', BlockType.Spoken],
      ['Here it is, finally.', BlockType.Note],
      ['0:10', BlockType.Note],
      ['Hands open the box', BlockType.Spoken],
      ["Let's open it together.", BlockType.Note],
    ]);
    expect(tablesOf(visual)[0]?.spokenColumn).toBe(1);
    const none = unwrap(setSpokenColumn(blocks, 0, null));
    expect(tablesOf(none)[0]?.spokenColumn).toBeNull();
    expect(none.filter((block) => block.source.table === undefined)).toEqual(blocks.filter((block) => block.source.table === undefined));
  });

  it('T12: an unknown table is refused', () => {
    expect(setSpokenColumn(blocks, 3, 0)).toEqual({ ok: false, error: ScriptEditError.BlockNotFound });
  });
});
