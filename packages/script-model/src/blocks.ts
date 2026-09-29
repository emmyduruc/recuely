import { BlockType, type ScriptBlock, type ScriptBlockInput } from '@repo/contracts';
import { type EditResult, fail, type IdFactory, ok, ScriptEditError } from './result.ts';

export const BlockInputIssue = {
  OutOfRange: 'out_of_range',
  Overlap: 'overlap',
  Blank: 'blank',
} as const;
export type BlockInputIssue = (typeof BlockInputIssue)[keyof typeof BlockInputIssue];

export type BuildBlocksResult =
  | { ok: true; value: ScriptBlock[] }
  | { ok: false; issues: { index: number; issue: BlockInputIssue }[] };

/**
 * Builds blocks from client-sent types and ranges (the review UI keeps the user's re-typing). Each range must lie
 * inside `source`, follow the previous one without overlap and contain non-whitespace; the text is always
 * `source.slice(start, end)`, never taken from the client.
 */
export function buildBlocks(source: string, inputs: readonly ScriptBlockInput[], newId: IdFactory): BuildBlocksResult {
  const issues: { index: number; issue: BlockInputIssue }[] = [];
  let previousEnd = 0;
  inputs.forEach((input, index) => {
    if (input.start < 0 || input.end > source.length || input.start >= input.end) {
      issues.push({ index, issue: BlockInputIssue.OutOfRange });
      return;
    }
    if (input.start < previousEnd) {
      issues.push({ index, issue: BlockInputIssue.Overlap });
    }
    if (source.slice(input.start, input.end).trim().length === 0) {
      issues.push({ index, issue: BlockInputIssue.Blank });
    }
    previousEnd = input.end;
  });
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: inputs.map((input, order) => ({
      id: newId(),
      order,
      type: input.type,
      text: source.slice(input.start, input.end),
      source: { start: input.start, end: input.end, ...(input.table === undefined ? {} : { table: input.table }) },
      metadata: input.metadata ?? {},
    })),
  };
}

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

/** A table found in the blocks: its columns (with header text, if any) and the column read aloud, if exactly one. */
export interface TableSummary {
  index: number;
  columns: { column: number; header: string | null }[];
  spokenColumn: number | null;
}

function bodyCells(blocks: readonly ScriptBlock[], tableIndex: number): ScriptBlock[] {
  return blocks.filter((block) => block.source.table?.index === tableIndex && block.metadata.tableHeader !== true);
}

/** Tables in block order, for the review UI's column picker. */
export function tablesOf(blocks: readonly ScriptBlock[]): TableSummary[] {
  const tables = new Map<number, Map<number, string | null>>();
  for (const block of blocks) {
    const table = block.source.table;
    if (table === undefined) continue;
    const columns = tables.get(table.index) ?? new Map<number, string | null>();
    if (!columns.has(table.column)) columns.set(table.column, table.header);
    tables.set(table.index, columns);
  }
  return [...tables].map(([index, columns]) => {
    const cells = bodyCells(blocks, index);
    const spoken = new Set(cells.filter((cell) => cell.type === BlockType.Spoken).map((cell) => cell.source.table?.column));
    const [only] = spoken;
    const allOfIt = only !== undefined && spoken.size === 1 && cells.filter((cell) => cell.source.table?.column === only).every((cell) => cell.type === BlockType.Spoken);
    return {
      index,
      columns: [...columns].sort(([a], [b]) => a - b).map(([column, header]) => ({ column, header })),
      spokenColumn: allOfIt ? only : null,
    };
  });
}

/**
 * Makes one column of a table the spoken one: its body cells become spoken, the other body cells notes.
 * `column: null` makes the whole table notes. Header cells and all other blocks are untouched.
 */
export function setSpokenColumn(blocks: readonly ScriptBlock[], tableIndex: number, column: number | null): EditResult<ScriptBlock[]> {
  const cells = new Set(bodyCells(blocks, tableIndex).map((cell) => cell.id));
  if (cells.size === 0) {
    return fail(ScriptEditError.BlockNotFound);
  }
  return ok(
    blocks.map((block) => {
      if (!cells.has(block.id)) return block;
      return { ...block, type: block.source.table?.column === column ? BlockType.Spoken : BlockType.Note };
    }),
  );
}
