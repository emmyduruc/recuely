import { BlockType, ChunkMode, type ChunkPlan, type ChunkRange, type ScriptBlock } from '@repo/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyBoundaryProposals,
  checkCoverage,
  type EditResult,
  isCutPosition,
  MAX_SNAP_DISTANCE,
  mergeWithNext,
  moveBoundary,
  parseScript,
  rechunkFrom,
  reconcileBlockIds,
  segment,
  splitChunk,
} from '../src/index.ts';
import { counter } from './helpers.ts';

// SPEC.md Task 3 done-when: property tests run ≥ 1,000 cases green.
const RUNS = 1000;

const WORDS = [
  'hello', 'world', 'Dr.', 'Mr.', 'e.g.', 'café', 'café', 'naïve', '👋🏽',
  '👨‍👩‍👧', '**bold**', '_em_', '*it*', 'snake_case', 'it’s', 'now—then',
  '3.5', 'fast,', 'go!', 'why?', 'end.', '(aside)', '“quote”', '1:30', 'wait…', 'a', 'I', '—', 'x;', 'colon:',
];
const SEPARATORS = [' ', ' ', ' ', '  ', '\t', ' \n'];

const word = fc.constantFrom(...WORDS);
const separator = fc.constantFrom(...SEPARATORS);
const sentence = fc
  .array(fc.tuple(word, separator), { minLength: 1, maxLength: 24 })
  .map((parts) => parts.map(([w, s]) => w + s).join('').trimEnd());

const line = fc.oneof(
  { weight: 6, arbitrary: sentence },
  { weight: 1, arbitrary: sentence.map((text) => `## ${text}`) },
  { weight: 1, arbitrary: sentence.map((text) => `Note: ${text}`) },
  { weight: 1, arbitrary: sentence.map((text) => `[${text.replaceAll(']', '')}]`) },
  { weight: 1, arbitrary: sentence.map((text) => `- ${text}`) },
  { weight: 2, arbitrary: fc.constant('') },
  {
    weight: 1,
    arbitrary: fc
      .array(fc.tuple(fc.constantFrom('0:05', '12', ''), sentence), { minLength: 1, maxLength: 3 })
      .map((rows) =>
        ['| Time | Line |', '|---|---|', ...rows.map(([time, text]) => `| ${time} | ${text.replaceAll('|', '/')} |`)].join('\n'),
      ),
  },
);
const script = fc.array(line, { minLength: 1, maxLength: 12 }).map((lines) => lines.join('\n'));
const mode = fc.constantFrom(...Object.values(ChunkMode));

function keyOf(ranges: readonly ChunkRange[]): string {
  return JSON.stringify(ranges);
}

function spokenBlocks(blocks: readonly ScriptBlock[]): ScriptBlock[] {
  return blocks.filter((block) => block.type === BlockType.Spoken);
}

/** Every chunk whose ranges existed before keeps its id; ids stay unique. */
function idsStable(before: ChunkPlan, after: ChunkPlan): boolean {
  const oldIds = new Map(before.chunks.map((chunk) => [keyOf(chunk.ranges), chunk.id]));
  const oldIdSet = new Set(before.chunks.map((chunk) => chunk.id));
  const unique = new Set(after.chunks.map((chunk) => chunk.id)).size === after.chunks.length;
  return (
    unique &&
    after.chunks.every((chunk) => {
      const previous = oldIds.get(keyOf(chunk.ranges));
      return previous === undefined ? !oldIdSet.has(chunk.id) : previous === chunk.id;
    })
  );
}

describe('T3 property tests (fast-check, ≥ 1,000 cases each)', () => {
  it('T3-P1: every parsed block is an exact slice of the source, in source order', () => {
    fc.assert(
      fc.property(script, (source) => {
        const blocks = parseScript(source, { newId: counter('b') });
        blocks.forEach((block, index) => {
          expect(source.slice(block.source.start, block.source.end)).toBe(block.text);
          expect(block.text.trim().length).toBeGreaterThan(0);
          const previous = blocks[index - 1];
          if (previous !== undefined) {
            expect(block.source.start).toBeGreaterThanOrEqual(previous.source.end);
          }
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('T3-P2: every mode covers each non-whitespace character exactly once and cuts only at word starts', () => {
    fc.assert(
      fc.property(script, mode, (source, chunkMode) => {
        const blocks = parseScript(source, { newId: counter('b') });
        const plan = segment(blocks, chunkMode, { newId: counter('c') });
        expect(checkCoverage(blocks, plan.chunks)).toEqual([]);
        const byId = new Map(blocks.map((block) => [block.id, block]));
        for (const chunk of plan.chunks) {
          const first = chunk.ranges[0];
          const block = first === undefined ? undefined : byId.get(first.blockId);
          expect(block !== undefined && first !== undefined && isCutPosition(block.text, first.start)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('T3-P3: random sequences of split/move/merge/rechunk keep coverage and keep untouched chunk ids', () => {
    const op = fc.record({
      kind: fc.constantFrom('split', 'move', 'merge', 'rechunk'),
      chunk: fc.nat(),
      fraction: fc.double({ min: 0, max: 1, noNaN: true }),
      mode,
    });
    fc.assert(
      fc.property(script, mode, fc.array(op, { maxLength: 8 }), (source, chunkMode, ops) => {
        const blocks = parseScript(source, { newId: counter('b') });
        const newId = counter('c');
        let plan = segment(blocks, chunkMode, { newId });
        for (const { kind, chunk: pick, fraction, mode: nextMode } of ops) {
          const chunk = plan.chunks[pick % Math.max(plan.chunks.length, 1)];
          const range = chunk?.ranges[0];
          if (chunk === undefined || range === undefined) {
            continue;
          }
          const block = blocks.find((candidate) => candidate.id === range.blockId);
          const at = { blockId: range.blockId, offset: Math.floor(fraction * (block?.text.length ?? 0)) };
          const OPS: Record<string, () => EditResult<ChunkPlan>> = {
            split: () => splitChunk(blocks, plan, chunk.id, at, newId),
            move: () => moveBoundary(blocks, plan, chunk.id, at, newId),
            merge: () => mergeWithNext(blocks, plan, chunk.id, newId),
            rechunk: () => rechunkFrom(blocks, plan, chunk.id, nextMode, { newId }),
          };
          const result = OPS[kind]?.();
          if (result?.ok === true) {
            expect(idsStable(plan, result.value)).toBe(true);
            plan = result.value;
          }
          expect(checkCoverage(blocks, plan.chunks)).toEqual([]);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('T3-P4: AI boundary proposals are snapped to a nearby word start or rejected; coverage always holds', () => {
    fc.assert(
      fc.property(
        script,
        fc.array(fc.tuple(fc.nat(), fc.oneof(fc.integer({ min: -20, max: 400 }), fc.double({ noNaN: true }))), { maxLength: 10 }),
        (source, raw) => {
          const blocks = parseScript(source, { newId: counter('b') });
          const spoken = spokenBlocks(blocks);
          const pool = blocks.length === 0 ? [] : blocks;
          const proposals = raw.flatMap(([pick, offset]) => {
            const block = pool[pick % Math.max(pool.length, 1)];
            return block === undefined ? [] : [{ blockId: block.id, offset }];
          });
          const outcome = applyBoundaryProposals(blocks, ChunkMode.Smart, proposals, counter('c'));
          expect(outcome.accepted.length + outcome.rejected.length).toBe(proposals.length);
          for (const { proposal, offset } of outcome.accepted) {
            const block = spoken.find((candidate) => candidate.id === proposal.blockId);
            expect(block !== undefined && isCutPosition(block.text, offset)).toBe(true);
            expect(Math.abs(offset - proposal.offset)).toBeLessThanOrEqual(MAX_SNAP_DISTANCE);
          }
          expect(checkCoverage(blocks, outcome.plan.chunks)).toEqual([]);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('T3-P5: editing one paragraph keeps every other block id (and so every chunk range in them)', () => {
    // One paragraph per block: single-line, tab-free, distinct paragraphs (tabs would make a table).
    const paragraph = fc
      .array(word, { minLength: 1, maxLength: 12 })
      .map((words) => `Say ${words.join(' ')}`);
    fc.assert(
      fc.property(fc.uniqueArray(paragraph, { minLength: 2, maxLength: 8 }), fc.nat(), (paragraphs, pick) => {
        const target = pick % paragraphs.length;
        const edited = paragraphs.map((text, index) => (index === target ? `${text} (edited)` : text));
        const before = parseScript(paragraphs.join('\n\n'), { newId: counter('b') });
        const after = reconcileBlockIds(before, parseScript(edited.join('\n\n'), { newId: counter('n') }));
        expect(after).toHaveLength(before.length);
        after.forEach((block, index) => {
          if (index === target) {
            expect(block.id.startsWith('n')).toBe(true);
          } else {
            expect(block.id).toBe(before[index]?.id);
          }
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('T3-P6: spoken text differs from chunk text only by whitespace and emphasis markers', () => {
    fc.assert(
      fc.property(script, mode, (source, chunkMode) => {
        const blocks = parseScript(source, { newId: counter('b') });
        for (const chunk of segment(blocks, chunkMode, { newId: counter('c') }).chunks) {
          const original = chunk.text.replace(/\s/g, '');
          const spoken = chunk.spokenText.replace(/\s/g, '');
          let cursor = 0;
          for (const char of original) {
            if (cursor < spoken.length && spoken.startsWith(char, cursor)) {
              cursor += char.length;
            } else {
              expect(['*', '_']).toContain(char);
            }
          }
          expect(cursor).toBe(spoken.length);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
