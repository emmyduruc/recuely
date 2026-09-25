import {
  ApiErrorCode,
  type ChunkInput,
  type ChunkRange,
  type CreateChunkPlanRequest,
  type CreateScriptRequest,
  type ScriptBlock,
  type ScriptChunk,
} from '@repo/contracts';
import {
  chunkRangesById,
  type DataSource,
  type ExportRow,
  findChunkPlan,
  findExport,
  findProject,
  findScript,
  findSession,
  findTake,
  isUuid,
  latestScript,
  type PlanWithChunks,
  type ProjectRow,
  scriptBlocks,
  type ScriptRow,
  type SessionRow,
  type TakeRow,
  toScriptBlock,
  type UserRow,
  uuidv7,
} from '@repo/db';
import { buildBlocks, checkCoverage, chunksFromRanges, parseScript, reconcileBlockIds, segment } from '@repo/script-model';
import { notFound, unprocessable } from './api-error';

// Loaders scoped to the local user (another user's ids are "not found") and the server-side rules that keep
// scripts and plans honest: text is always derived by the server, coverage is always checked (SPEC.md Task 4).

async function required<T>(id: string, what: string, load: () => Promise<T | null>): Promise<T> {
  const found = isUuid(id) ? await load() : null;
  if (found === null) {
    throw notFound(`No ${what} with this id.`);
  }
  return found;
}

export const requireProject = (ds: DataSource, user: UserRow, id: string): Promise<ProjectRow> =>
  required(id, 'project', () => findProject(ds, user.id, id));
export const requireScript = (ds: DataSource, user: UserRow, id: string): Promise<ScriptRow> =>
  required(id, 'script', () => findScript(ds, user.id, id));
export const requirePlan = (ds: DataSource, user: UserRow, id: string): Promise<PlanWithChunks & { script: ScriptRow }> =>
  required(id, 'chunk plan', () => findChunkPlan(ds, user.id, id));
export const requireSession = (ds: DataSource, user: UserRow, id: string): Promise<SessionRow> =>
  required(id, 'session', () => findSession(ds, user.id, id));
export const requireTake = (ds: DataSource, user: UserRow, id: string): Promise<TakeRow> =>
  required(id, 'take', () => findTake(ds, user.id, id));
export const requireExport = (ds: DataSource, user: UserRow, id: string): Promise<ExportRow> =>
  required(id, 'export', () => findExport(ds, user.id, id));

/**
 * Blocks for a new script version: parsed by the server, or built from the client's types + ranges. Ids of
 * blocks unchanged since the previous version are kept (Task 3 `reconcileBlockIds`).
 */
export async function buildScriptBlocks(ds: DataSource, project: ProjectRow, request: CreateScriptRequest): Promise<ScriptBlock[]> {
  let blocks: ScriptBlock[];
  if (request.blocks === undefined) {
    blocks = parseScript(request.sourceText, { newId: uuidv7 });
  } else {
    const built = buildBlocks(request.sourceText, request.blocks, uuidv7);
    if (!built.ok) {
      throw unprocessable(
        ApiErrorCode.ValidationFailed,
        'Blocks must be non-empty, in-order, non-overlapping ranges of sourceText.',
        built.issues.map(({ index, issue }) => ({ field: `blocks[${String(index)}]`, issue })),
      );
    }
    blocks = built.value;
  }
  const previous = await latestScript(ds, project.id);
  if (previous === null) {
    return blocks;
  }
  return reconcileBlockIds((await scriptBlocks(ds, previous.id)).map(toScriptBlock), blocks);
}

function rangesKey(ranges: readonly ChunkRange[]): string {
  return ranges.map((range) => `${range.blockId}:${String(range.start)}-${String(range.end)}`).join('|');
}

/**
 * Chunks for a new plan version. The server rebuilds all text from ranges and checks coverage (422
 * `coverage_violation`). A chunk with the same ranges as a chunk of an earlier plan of this script keeps that
 * id; a client-sent id that an earlier plan used for different ranges is refused, so an id never names two
 * different texts and takes never move (SPEC.md §B4).
 */
export async function buildPlanChunks(
  ds: DataSource,
  script: ScriptRow,
  request: CreateChunkPlanRequest,
): Promise<ScriptChunk[]> {
  const blocks = (await scriptBlocks(ds, script.id)).map(toScriptBlock);
  const previous = await chunkRangesById(ds, script.id);
  const idByRanges = new Map([...previous].map(([id, ranges]) => [rangesKey(ranges), id]));

  const inputs: readonly ChunkInput[] =
    request.chunks ?? segment(blocks, request.mode, { newId: uuidv7 }).chunks.map(({ ranges }) => ({ ranges }));
  const seen = new Set<string>();
  const details: { field: string; issue: string }[] = [];
  const withIds = inputs.map((input, index) => {
    const key = rangesKey(input.ranges);
    const priorRanges = input.id === undefined ? undefined : previous.get(input.id);
    if (input.id !== undefined && priorRanges !== undefined && rangesKey(priorRanges) !== key) {
      details.push({ field: `chunks[${String(index)}].id`, issue: 'was used by an earlier plan for different text' });
    }
    const id = input.id ?? idByRanges.get(key) ?? uuidv7();
    if (seen.has(id)) {
      details.push({ field: `chunks[${String(index)}].id`, issue: 'is used twice in this plan' });
    }
    seen.add(id);
    return { id, ranges: input.ranges };
  });
  if (details.length > 0) {
    throw unprocessable(ApiErrorCode.ValidationFailed, 'Chunk ids are invalid.', details);
  }

  const chunks = chunksFromRanges(blocks, withIds, uuidv7);
  const issues = checkCoverage(blocks, chunks);
  if (issues.length > 0) {
    throw unprocessable(
      ApiErrorCode.CoverageViolation,
      'The chunks must cover every word of the spoken text exactly once, in order.',
      issues.map((issue) => ({ field: issue.chunkId === undefined ? 'chunks' : `chunk ${issue.chunkId}`, issue: issue.code })),
    );
  }
  return chunks;
}
