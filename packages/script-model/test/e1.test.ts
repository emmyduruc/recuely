import { BlockType, ChunkMode, type ChunkPlan, type ScriptBlock, type ScriptChunk } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import {
  assertCoverage,
  mergeWithNext,
  moveBoundary,
  normalize,
  parseScript,
  retypeBlock,
  segment,
  splitChunk,
} from '../src/index.ts';
import { counter, readScriptFixture, texts, unwrap } from './helpers.ts';

const source = readScriptFixture('e1-mixed.md');

function blockWithText(blocks: readonly ScriptBlock[], text: string): ScriptBlock {
  const block = blocks.find((candidate) => candidate.text === text);
  if (block === undefined) {
    throw new Error(`no block "${text}"`);
  }
  return block;
}

function chunkWithText(plan: ChunkPlan, text: string): ScriptChunk {
  const chunk = plan.chunks.find((candidate) => candidate.text === text);
  if (chunk === undefined) {
    throw new Error(`no chunk "${text}"`);
  }
  return chunk;
}

describe('E1 at the model level (SPEC.md §C4)', () => {
  const blocks = parseScript(source, { newId: counter('b') });

  it('T3-E1: headings, notes, cues and table parts are typed; spoken text is found', () => {
    expect(blocks.map((block) => [block.type, block.text])).toEqual([
      [BlockType.Heading, 'Product launch'],
      [BlockType.Note, 'Smile and look at the lens.'],
      [BlockType.Spoken, "Welcome back, everyone. Today we're launching something **new**."],
      [BlockType.SceneCue, 'Scene 2: show the product screen'],
      [BlockType.Spoken, "It's small, light, and fast. Dr. Smith designed it — with care."],
      [BlockType.Heading, 'Time'],
      [BlockType.Heading, 'Visual'],
      [BlockType.Heading, 'Line'],
      [BlockType.Note, '0:05'],
      [BlockType.Note, 'Close-up of the box'],
      [BlockType.Spoken, 'Here it is, finally.'],
      [BlockType.Note, '0:10'],
      [BlockType.Note, 'Hands open the box'],
      [BlockType.Spoken, "Let's open it together."],
      [BlockType.Spoken, 'First, charge it overnight.'],
      [BlockType.Spoken, 'Then press the button.'],
      [BlockType.Spoken, 'Thanks for watching.'],
    ]);
  });

  it('T3-E1: every block is an exact slice of the paste, and table cells keep row/column provenance', () => {
    for (const block of blocks) {
      expect(source.slice(block.source.start, block.source.end)).toBe(block.text);
    }
    expect(blockWithText(blocks, 'Here it is, finally.').source.table).toEqual({
      index: 0,
      row: 1,
      column: 2,
      header: 'Line',
    });
  });

  it('T3-E1: sentence chunks keep exact wording; the scene cue precedes its chunk; notes are never chunked', () => {
    const plan = segment(blocks, ChunkMode.Sentence, { newId: counter('c') });
    expect(texts(plan)).toEqual([
      'Welcome back, everyone.',
      "Today we're launching something **new**.",
      "It's small, light, and fast.",
      'Dr. Smith designed it — with care.',
      'Here it is, finally.',
      "Let's open it together.",
      'First, charge it overnight.',
      'Then press the button.',
      'Thanks for watching.',
    ]);
    expect(plan.chunks[1]?.spokenText).toBe("Today we're launching something new.");
    expect(plan.chunks[2]?.sceneCue).toEqual({ blockId: blocks[3]?.id, text: 'Scene 2: show the product screen' });
    expect(plan.chunks.filter((chunk) => chunk.sceneCue !== null)).toHaveLength(1);
    const allChunkText = texts(plan).join(' ');
    for (const hidden of ['Product launch', 'Smile and look', '0:05', 'Close-up of the box', 'Visual']) {
      expect(allChunkText).not.toContain(hidden);
    }
    assertCoverage(blocks, plan.chunks);
  });

  it('T3-E1: the user marks spoken content and moves boundaries; wording is preserved exactly', () => {
    const newId = counter('e');
    const visual = blockWithText(blocks, 'Close-up of the box');
    const marked = unwrap(retypeBlock(blocks, visual.id, BlockType.Spoken));
    let plan = segment(marked, ChunkMode.Sentence, { newId });
    expect(texts(plan)).toContain('Close-up of the box');

    const small = blockWithText(marked, "It's small, light, and fast. Dr. Smith designed it — with care.");
    const chunk = chunkWithText(plan, "It's small, light, and fast.");
    // Split at "and" (offset lands mid-word and is snapped to the word start).
    plan = unwrap(splitChunk(marked, plan, chunk.id, { blockId: small.id, offset: small.text.indexOf('and') + 1 }, newId));
    expect(texts(plan)).toContain("It's small, light,");
    expect(texts(plan)).toContain('and fast.');

    // Move the boundary of "and fast." back to include "light,".
    const andFast = chunkWithText(plan, 'and fast.');
    plan = unwrap(moveBoundary(marked, plan, andFast.id, { blockId: small.id, offset: small.text.indexOf('light') }, newId));
    expect(texts(plan)).toContain("It's small,");
    expect(texts(plan)).toContain('light, and fast.');

    // Merge across the paragraph break: "Thanks for watching." joins the previous bullet.
    const press = chunkWithText(plan, 'Then press the button.');
    const pressIndex = plan.chunks.indexOf(press);
    if (pressIndex < 0) {
      throw new Error('chunk missing');
    }
    plan = unwrap(mergeWithNext(marked, plan, press.id, newId));
    expect(plan.chunks[pressIndex]?.text).toBe('Then press the button. Thanks for watching.');
    expect(plan.chunks[pressIndex]?.ranges).toHaveLength(2);

    assertCoverage(marked, plan.chunks);
    const spokenSource = marked.filter((block) => block.type === BlockType.Spoken).map((block) => block.text);
    expect(normalize(texts(plan).join(' '))).toBe(normalize(spokenSource.join(' ')));
  });
});
