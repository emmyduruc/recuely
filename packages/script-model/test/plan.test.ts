import { BlockType, ChunkMode } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyBoundaryProposals,
  assertCoverage,
  mergeWithNext,
  moveBoundary,
  parseScript,
  ProposalRejection,
  rechunkFrom,
  reconcileBlockIds,
  retypeBlock,
  ScriptEditError,
  segment,
  splitChunk,
} from '../src/index.ts';
import { counter, texts, unwrap } from './helpers.ts';

const SOURCE = '# Intro\n\nOne two three. Four five six.\n\nSeven eight nine. Ten eleven twelve.';

function setup() {
  const blocks = parseScript(SOURCE, { newId: counter('b') });
  const newId = counter('c');
  const plan = segment(blocks, ChunkMode.Sentence, { newId });
  return { blocks, plan, newId };
}

describe('boundary edits', () => {
  it('T3: split, move and merge produce the expected chunks and keep coverage', () => {
    const { blocks, plan, newId } = setup();
    const first = blocks[1];
    const chunk = plan.chunks[0];
    if (first === undefined || chunk === undefined) {
      throw new Error('setup');
    }
    const split = unwrap(splitChunk(blocks, plan, chunk.id, { blockId: first.id, offset: 4 }, newId));
    expect(texts(split).slice(0, 3)).toEqual(['One', 'two three.', 'Four five six.']);

    const second = split.chunks[1];
    if (second === undefined) {
      throw new Error('setup');
    }
    const moved = unwrap(moveBoundary(blocks, split, second.id, { blockId: first.id, offset: 8 }, newId));
    expect(texts(moved).slice(0, 2)).toEqual(['One two', 'three.']);

    // Moving the boundary changed the chunk's ranges, so it has a new id (takes stay on the old one).
    const movedSecond = moved.chunks[1];
    if (movedSecond === undefined) {
      throw new Error('setup');
    }
    expect(movedSecond.id).not.toBe(second.id);
    const merged = unwrap(mergeWithNext(blocks, moved, movedSecond.id, newId));
    expect(texts(merged).slice(0, 2)).toEqual(['One two', 'three. Four five six.']);
    assertCoverage(blocks, merged.chunks);
  });

  it('T3: edits are refused with a reason and never throw', () => {
    const { blocks, plan, newId } = setup();
    const [first, second] = plan.chunks;
    const last = plan.chunks.at(-1);
    const heading = blocks[0];
    const spoken = blocks[1];
    if (first === undefined || second === undefined || last === undefined || heading === undefined || spoken === undefined) {
      throw new Error('setup');
    }
    const at = { blockId: spoken.id, offset: 4 };
    expect(splitChunk(blocks, plan, 'missing', at, newId)).toEqual({ ok: false, error: ScriptEditError.ChunkNotFound });
    expect(splitChunk(blocks, plan, first.id, { blockId: heading.id, offset: 0 }, newId)).toEqual({
      ok: false,
      error: ScriptEditError.NotSpoken,
    });
    expect(splitChunk(blocks, plan, second.id, at, newId)).toEqual({ ok: false, error: ScriptEditError.OutsideChunk });
    expect(splitChunk(blocks, plan, first.id, { blockId: spoken.id, offset: 0 }, newId)).toEqual({
      ok: false,
      error: ScriptEditError.OutsideChunk,
    });
    expect(mergeWithNext(blocks, plan, last.id, newId)).toEqual({ ok: false, error: ScriptEditError.LastChunk });
    expect(moveBoundary(blocks, plan, first.id, at, newId)).toEqual({ ok: false, error: ScriptEditError.FirstChunk });
  });

  it('T3: headings and notes only become chunks when re-typed as spoken', () => {
    const { blocks, newId } = setup();
    const heading = blocks[0];
    if (heading === undefined) {
      throw new Error('setup');
    }
    expect(texts(segment(blocks, ChunkMode.Paragraph, { newId }))).not.toContain('Intro');
    const retyped = unwrap(retypeBlock(blocks, heading.id, BlockType.Spoken));
    expect(texts(segment(retyped, ChunkMode.Paragraph, { newId }))[0]).toBe('Intro');
    expect(retypeBlock(blocks, 'missing', BlockType.Spoken)).toEqual({ ok: false, error: ScriptEditError.BlockNotFound });
  });
});

describe('stable chunk ids', () => {
  it('T3: an edit keeps the ids of every chunk it did not change; changed chunks get new ids', () => {
    const { blocks, plan, newId } = setup();
    const before = plan.chunks.map((chunk) => chunk.id);
    const firstBlock = blocks[1];
    const firstChunk = plan.chunks[0];
    if (firstBlock === undefined || firstChunk === undefined) {
      throw new Error('setup');
    }
    const split = unwrap(splitChunk(blocks, plan, firstChunk.id, { blockId: firstBlock.id, offset: 4 }, newId));
    const after = split.chunks.map((chunk) => chunk.id);
    expect(after.slice(2)).toEqual(before.slice(1));
    expect(after.slice(0, 2)).not.toContain(before[0]);
  });

  it('T3: rechunkFrom leaves earlier chunks untouched, ids included', () => {
    const { blocks, plan, newId } = setup();
    const third = plan.chunks[2];
    if (third === undefined) {
      throw new Error('setup');
    }
    const rechunked = unwrap(rechunkFrom(blocks, plan, third.id, ChunkMode.Paragraph, { newId }));
    expect(rechunked.chunks.slice(0, 2)).toEqual(plan.chunks.slice(0, 2));
    expect(texts(rechunked)).toEqual(['One two three.', 'Four five six.', 'Seven eight nine. Ten eleven twelve.']);
    expect(rechunked.mode).toBe(ChunkMode.Paragraph);
    assertCoverage(blocks, rechunked.chunks);
  });

  it('T3: rechunkFrom a chunk that starts mid-paragraph segments only the remainder', () => {
    const { blocks, plan, newId } = setup();
    const second = plan.chunks[1];
    if (second === undefined) {
      throw new Error('setup');
    }
    const rechunked = unwrap(rechunkFrom(blocks, plan, second.id, ChunkMode.Paragraph, { newId }));
    expect(texts(rechunked)).toEqual(['One two three.', 'Four five six.', 'Seven eight nine. Ten eleven twelve.']);
    expect(rechunked.chunks[1]?.id).toBe(second.id);
  });

  it('T3: editing one paragraph keeps the other blocks’ ids and the chunk ids in them', () => {
    const { blocks, plan, newId } = setup();
    const edited = parseScript(SOURCE.replace('Seven eight nine.', 'Seven, eight, nine!'), { newId: counter('n') });
    const reconciled = reconcileBlockIds(blocks, edited);
    expect(reconciled.slice(0, 2).map((block) => block.id)).toEqual(blocks.slice(0, 2).map((block) => block.id));
    expect(reconciled[2]?.id).toBe('n3');
    const replanned = segment(reconciled, ChunkMode.Sentence, { newId });
    // Chunks are rebuilt, so ids are reused only through an edit op; ranges in unchanged blocks are identical.
    expect(replanned.chunks.slice(0, 2).map((chunk) => chunk.ranges)).toEqual(plan.chunks.slice(0, 2).map((c) => c.ranges));
  });
});

describe('AI boundary proposals (SPEC.md §B5 rule 5)', () => {
  it('T3: offsets on a word start are accepted, mid-word ones are snapped, far or foreign ones are rejected', () => {
    const blocks = parseScript('# H\n\nalpha beta gamma delta epsilon zeta eta theta', { newId: counter('b') });
    const spoken = blocks[1];
    const heading = blocks[0];
    if (spoken === undefined || heading === undefined) {
      throw new Error('setup');
    }
    const outcome = applyBoundaryProposals(
      blocks,
      ChunkMode.Smart,
      [
        { blockId: spoken.id, offset: spoken.text.indexOf('gamma') },
        { blockId: spoken.id, offset: spoken.text.indexOf('epsilon') + 3 },
        { blockId: heading.id, offset: 0 },
        { blockId: spoken.id, offset: 1.5 },
        { blockId: 'nope', offset: 0 },
      ],
      counter('c'),
    );
    expect(texts(outcome.plan)).toEqual(['alpha beta', 'gamma delta', 'epsilon zeta eta theta']);
    expect(outcome.accepted.map((entry) => entry.offset)).toEqual([spoken.text.indexOf('gamma'), spoken.text.indexOf('epsilon')]);
    expect(outcome.rejected.map((entry) => entry.reason)).toEqual([
      ProposalRejection.NotSpoken,
      ProposalRejection.NoBoundaryNearby,
      ProposalRejection.NotSpoken,
    ]);
    assertCoverage(blocks, outcome.plan.chunks);
  });

  it('T3: a proposal far from any word start is rejected, not stretched', () => {
    const word = 'a'.repeat(40);
    const blocks = parseScript(`start ${word} end`, { newId: counter('b') });
    const spoken = blocks[0];
    if (spoken === undefined) {
      throw new Error('setup');
    }
    const outcome = applyBoundaryProposals(blocks, ChunkMode.Smart, [{ blockId: spoken.id, offset: 26 }], counter('c'));
    expect(outcome.rejected).toEqual([{ proposal: { blockId: spoken.id, offset: 26 }, reason: ProposalRejection.NoBoundaryNearby }]);
    expect(texts(outcome.plan)).toEqual([spoken.text]);
  });
});
