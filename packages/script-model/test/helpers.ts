import { readFileSync } from 'node:fs';
import type { ChunkPlan } from '@repo/contracts';
import type { EditResult, IdFactory } from '../src/index.ts';

/** Deterministic ids: `b1, b2, …` / `c1, c2, …`. */
export function counter(prefix: string): IdFactory {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}${String(next)}`;
  };
}

export function readScriptFixture(name: string): string {
  return readFileSync(new URL(`../../../tests/fixtures/scripts/${name}`, import.meta.url), 'utf8');
}

export function unwrap<T>(result: EditResult<T>): T {
  if (!result.ok) {
    throw new Error(`edit failed: ${result.error}`);
  }
  return result.value;
}

export function texts(plan: ChunkPlan): string[] {
  return plan.chunks.map((chunk) => chunk.text);
}
