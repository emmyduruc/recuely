import { readFileSync } from 'node:fs';
import { BlockType, ChunkMode, type ScriptBlock } from '@repo/contracts';
import { chunksFromRanges, mergeWithNext, parseScript, retypeBlock, segment } from '@repo/script-model';
import { describe, expect, it } from 'vitest';
import { blockInputs, chunkWords, planInputs } from '../app/utils/script-review';

const E1 = readFileSync(new URL('../../../tests/fixtures/scripts/e1-mixed.md', import.meta.url), 'utf8');
let next = 0;
const newId = (): string => `id${String((next += 1))}`;

describe('script review helpers (Task 12)', () => {
  const blocks = parseScript(E1, { newId });

  it('T12: chunk words and gaps rebuild each chunk text verbatim, also across a merge', () => {
    let plan = segment(blocks, ChunkMode.Short, { newId });
    const last = plan.chunks.at(-2);
    if (last === undefined) throw new Error('plan too short');
    const merged = mergeWithNext(blocks, plan, last.id, newId);
    if (!merged.ok) throw new Error(merged.error);
    plan = merged.value;
    for (const chunk of plan.chunks) {
      const words = chunkWords(blocks, chunk);
      expect(words.map((word) => word.gapBefore + word.text).join('')).toBe(chunk.text);
    }
    expect(plan.chunks.some((chunk) => chunk.ranges.length === 2)).toBe(true);
  });

  it('T12: block inputs carry types, ranges and table provenance, never text', () => {
    const inputs = blockInputs(blocks);
    expect(inputs).toHaveLength(blocks.length);
    for (const [index, input] of inputs.entries()) {
      expect(input).not.toHaveProperty('text');
      expect(E1.slice(input.start, input.end)).toBe(blocks[index]?.text);
    }
    expect(inputs.filter((input) => input.table !== undefined)).toHaveLength(9);
  });

  it('T12: plan inputs map every range to the server block at the same position', () => {
    const retyped = retypeBlock(blocks, blocks[1]?.id ?? '', BlockType.Spoken);
    if (!retyped.ok) throw new Error(retyped.error);
    const plan = segment(retyped.value, ChunkMode.Sentence, { newId });
    const server: ScriptBlock[] = retyped.value.map((block) => ({ ...block, id: `server-${block.id}` }));
    const inputs = planInputs(retyped.value, server, plan.chunks);
    expect(inputs.flatMap((input) => input.ranges.map((range) => range.blockId)).every((id) => id.startsWith('server-'))).toBe(true);
    expect(chunksFromRanges(server, inputs, newId).map((chunk) => chunk.text)).toEqual(plan.chunks.map((chunk) => chunk.text));
  });
});
