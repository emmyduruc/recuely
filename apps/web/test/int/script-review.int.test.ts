// Task 12: a plan edited in the review UI round-trips through the API unchanged (SPEC.md Task 12 tests).
import { readFileSync } from 'node:fs';
import {
  BlockType,
  ChunkMode,
  ContractType,
  SourceKind,
} from '@repo/contracts';
import { validateContract } from '@repo/contracts/validation';
import {
  BoundaryStep,
  checkCoverage,
  mergeWithNext,
  moveBoundary,
  nudgeBoundary,
  parseScript,
  segment,
  setSpokenColumn,
  splitChunk,
  type EditResult,
} from '@repo/script-model';
import { describe, expect, it } from 'vitest';
import { blockInputs, planInputs } from '../../app/utils/script-review';
import { api, useSeededDatabase } from './helpers';

const E1 = readFileSync(new URL('../../../../tests/fixtures/scripts/e1-mixed.md', import.meta.url), 'utf8');
const CREATED = 201;
let next = 0;
const newId = (): string => `client-${String((next += 1))}`;

/** Asserts the status, validates the body against its contract and returns it typed. */
async function resource<K extends ContractType>(type: K, response: Promise<{ status: number; body: unknown }>, status = 200) {
  const { status: actual, body } = await response;
  expect(actual, JSON.stringify(body)).toBe(status);
  const result = validateContract(type, body);
  if (!result.ok) throw new Error(`${type} failed its contract: ${JSON.stringify(result.issues)}`);
  return result.value;
}

function unwrap<T>(result: EditResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('Task 12: saved plan round-trips', () => {
  useSeededDatabase();

  it('T12: a re-typed script and an edited plan are stored and read back exactly', async () => {
    // What the review UI does: parse, pick the Visual column, re-chunk, split, move, nudge and merge.
    const blocks = unwrap(setSpokenColumn(parseScript(E1, { newId }), 0, 1));
    let plan = segment(blocks, ChunkMode.Short, { newId });
    const small = blocks.find((block) => block.text.startsWith("It's small"));
    const first = plan.chunks.find((chunk) => chunk.text.startsWith("It's small"));
    if (small === undefined || first === undefined) throw new Error('fixture changed');
    plan = unwrap(splitChunk(blocks, plan, first.id, { blockId: small.id, offset: small.text.indexOf('light') }, newId));
    const afterSplit = plan.chunks.find((chunk) => chunk.text.startsWith('light'));
    plan = unwrap(moveBoundary(blocks, plan, afterSplit?.id ?? '', { blockId: small.id, offset: small.text.indexOf('and') }, newId));
    plan = unwrap(nudgeBoundary(blocks, plan, plan.chunks[3]?.id ?? '', BoundaryStep.Later, newId));
    plan = unwrap(mergeWithNext(blocks, plan, plan.chunks.at(-2)?.id ?? '', newId));
    expect(checkCoverage(blocks, plan.chunks)).toEqual([]);

    const project = await resource(ContractType.Project, api('POST', '/api/projects', { title: 'Round trip' }), CREATED);
    const script = await resource(
      ContractType.Script,
      api('POST', `/api/projects/${project.id}/scripts`, { sourceKind: SourceKind.Paste, sourceText: E1, blocks: blockInputs(blocks) }),
      CREATED,
    );
    expect(script.blocks.map((block) => [block.type, block.text])).toEqual(blocks.map((block) => [block.type, block.text]));

    const saved = await resource(
      ContractType.ChunkPlan,
      api('POST', `/api/scripts/${script.id}/chunk-plans`, { mode: plan.mode, chunks: planInputs(blocks, script.blocks, plan.chunks) }),
      CREATED,
    );
    const stored = await resource(ContractType.ChunkPlan, api('GET', `/api/chunk-plans/${saved.id}`));
    expect(stored.mode).toBe(ChunkMode.Short);
    expect(stored.chunks.map((chunk) => chunk.text)).toEqual(plan.chunks.map((chunk) => chunk.text));
    expect(stored.chunks.map((chunk) => chunk.spokenText)).toEqual(plan.chunks.map((chunk) => chunk.spokenText));
    expect(stored.chunks.map((chunk) => chunk.sceneCue?.text ?? null)).toEqual(plan.chunks.map((chunk) => chunk.sceneCue?.text ?? null));
    const positions = (chunks: typeof plan.chunks, all: readonly { id: string; order: number }[]) =>
      chunks.map((chunk) => chunk.ranges.map((range) => [all.find((block) => block.id === range.blockId)?.order, range.start, range.end]));
    expect(positions(stored.chunks, script.blocks)).toEqual(positions(plan.chunks, blocks));

    const scriptBack = await resource(ContractType.Script, api('GET', `/api/scripts/${script.id}`));
    const spoken = scriptBack.blocks.filter((block) => block.type === BlockType.Spoken).map((block) => block.text);
    expect(spoken).toEqual(expect.arrayContaining(['Close-up of the box', 'Hands open the box']));
    expect(spoken).not.toContain('Here it is, finally.');
  });
});
