import { type BlockType, type ScriptBlock } from '@repo/contracts';
import { type EditResult, fail, ok, ScriptEditError } from './result.ts';

/** The user re-types a block (e.g. marks a note or table cell as spoken). Text and id are unchanged. */
export function retypeBlock(blocks: readonly ScriptBlock[], blockId: string, type: BlockType): EditResult<ScriptBlock[]> {
  if (!blocks.some((block) => block.id === blockId)) {
    return fail(ScriptEditError.BlockNotFound);
  }
  return ok(blocks.map((block) => (block.id === blockId ? { ...block, type } : block)));
}

function blockKey(block: ScriptBlock): string {
  return `${block.type}\u0000${block.text}`;
}

/**
 * Carries ids over from a previous parse: blocks with the same type and text, in the same relative order
 * (longest common subsequence), keep their id. So editing one paragraph leaves every other block's id, and
 * therefore every chunk range pointing at it, stable (SPEC.md Task 3).
 */
export function reconcileBlockIds(previous: readonly ScriptBlock[], next: readonly ScriptBlock[]): ScriptBlock[] {
  const n = previous.length;
  const m = next.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const at = (i: number, j: number): number => table[i]?.[j] ?? 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const row = table[i];
      const prev = previous[i];
      const curr = next[j];
      if (row === undefined || prev === undefined || curr === undefined) {
        continue;
      }
      row[j] = blockKey(prev) === blockKey(curr) ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const ids = next.map((block) => block.id);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const prev = previous[i];
    const curr = next[j];
    if (prev !== undefined && curr !== undefined && blockKey(prev) === blockKey(curr)) {
      ids[j] = prev.id;
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return next.map((block, index) => ({ ...block, id: ids[index] ?? block.id }));
}
