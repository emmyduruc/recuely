import {
  BlockType,
  type ChunkInput,
  type ChunkMode,
  type ChunkPlan,
  type ChunkRange,
  type ScriptBlock,
  type ScriptChunk,
} from '@repo/contracts';
import { type EditResult, fail, type IdFactory, ok, ScriptEditError } from './result.ts';
import { DEFAULT_TUNING, type SegmentationTuning, segmentText } from './segment.ts';
import { isCutPosition, snapToCut, spokenTextOf, trimRange } from './text.ts';

// A plan is a set of cuts over the spoken text: all spoken blocks in order, as one stream. A chunk runs from
// one cut to the next, so chunks always partition the spoken text: every non-whitespace character is covered
// exactly once, by construction (SPEC.md §B5 rule 2). Chunks may span blocks when the user merges across a
// paragraph break; each block contributes one range.

/** How far a user's drag or an AI offset may be moved to reach a word start (UTF-16 units). */
export const MAX_SNAP_DISTANCE = 12;

export interface BlockPosition {
  blockId: string;
  offset: number;
}

interface StreamBlock {
  block: ScriptBlock;
  /** Stream position of the block's offset 0. Blocks are separated by one virtual position. */
  base: number;
}

interface Stream {
  blocks: StreamBlock[];
  end: number;
  sceneCues: Map<string, ScriptBlock>;
}

export interface PlanOptions {
  newId: IdFactory;
  tuning?: SegmentationTuning;
}

function streamOf(blocks: readonly ScriptBlock[]): Stream {
  const ordered = [...blocks].sort((a, b) => a.order - b.order);
  const streamBlocks: StreamBlock[] = [];
  const sceneCues = new Map<string, ScriptBlock>();
  let base = 0;
  let pendingCue: ScriptBlock | null = null;
  for (const block of ordered) {
    if (block.type === BlockType.SceneCue) {
      pendingCue = block;
    } else if (block.type === BlockType.Spoken) {
      streamBlocks.push({ block, base });
      base += block.text.length + 1;
      if (pendingCue !== null) {
        sceneCues.set(block.id, pendingCue);
        pendingCue = null;
      }
    }
  }
  return { blocks: streamBlocks, end: Math.max(0, base - 1), sceneCues };
}

function toStream(stream: Stream, position: BlockPosition): number | null {
  const entry = stream.blocks.find(({ block }) => block.id === position.blockId);
  return entry === undefined ? null : entry.base + position.offset;
}

function blockAt(stream: Stream, position: number): StreamBlock | undefined {
  return stream.blocks.findLast(({ base }) => base <= position);
}

function isStreamCut(stream: Stream, position: number): boolean {
  const entry = blockAt(stream, position);
  return entry !== undefined && isCutPosition(entry.block.text, position - entry.base);
}

function rangesBetween(stream: Stream, from: number, to: number): ChunkRange[] {
  return stream.blocks.flatMap(({ block, base }) => {
    const start = Math.max(from - base, 0);
    const end = Math.min(to - base, block.text.length);
    if (start >= end) {
      return [];
    }
    const [trimmedStart, trimmedEnd] = trimRange(block.text, start, end);
    return trimmedStart < trimmedEnd ? [{ blockId: block.id, start: trimmedStart, end: trimmedEnd }] : [];
  });
}

function firstCut(stream: Stream): number[] {
  for (const { block, base } of stream.blocks) {
    const [start, end] = trimRange(block.text, 0, block.text.length);
    if (start < end) {
      return [base + start];
    }
  }
  return [];
}

function rangesKey(ranges: readonly ChunkRange[]): string {
  return ranges.map((range) => `${range.blockId}:${String(range.start)}-${String(range.end)}`).join('|');
}

function textOf(stream: Stream, ranges: readonly ChunkRange[]): string {
  return ranges
    .map((range) => {
      const entry = stream.blocks.find(({ block }) => block.id === range.blockId);
      return entry === undefined ? '' : entry.block.text.slice(range.start, range.end);
    })
    .join(' ');
}

/**
 * Builds chunks from cuts. A chunk whose ranges equal a previous chunk's keeps that chunk's id; every other
 * chunk gets a new id. Takes point at chunk ids, so an edit never re-links takes of chunks it didn't touch,
 * and changed chunks never inherit takes recorded for different text (SPEC.md §B4).
 */
function buildPlan(
  stream: Stream,
  mode: ChunkMode,
  cuts: readonly number[],
  previous: readonly ScriptChunk[],
  newId: IdFactory,
): ChunkPlan {
  // The first word of the stream always starts a chunk, whatever cuts were passed in.
  const sorted = [...new Set([...firstCut(stream), ...cuts])].sort((a, b) => a - b);
  const reusable = new Map(previous.map((chunk) => [rangesKey(chunk.ranges), chunk.id]));
  const chunks: ScriptChunk[] = [];
  sorted.forEach((cut, index) => {
    const ranges = rangesBetween(stream, cut, sorted[index + 1] ?? stream.end);
    const first = ranges[0];
    if (first === undefined) {
      return;
    }
    const key = rangesKey(ranges);
    const id = reusable.get(key) ?? newId();
    reusable.delete(key);
    const text = textOf(stream, ranges);
    const cue = stream.sceneCues.get(first.blockId);
    chunks.push({
      id,
      order: chunks.length,
      ranges,
      text,
      spokenText: spokenTextOf(text),
      sceneCue: cue !== undefined && isFirstChunkOfBlock(stream, first) ? { blockId: cue.id, text: cue.text } : null,
    });
  });
  return { mode, chunks };
}

function isFirstChunkOfBlock(stream: Stream, range: ChunkRange): boolean {
  const entry = stream.blocks.find(({ block }) => block.id === range.blockId);
  return entry !== undefined && trimRange(entry.block.text, 0, entry.block.text.length)[0] === range.start;
}

function cutsOf(stream: Stream, plan: ChunkPlan): number[] {
  return plan.chunks.flatMap((chunk) => {
    const first = chunk.ranges[0];
    const position = first === undefined ? null : toStream(stream, { blockId: first.blockId, offset: first.start });
    return position === null ? [] : [position];
  });
}

function modeCuts(stream: Stream, mode: ChunkMode, from: number, tuning: SegmentationTuning): number[] {
  return stream.blocks.flatMap(({ block, base }) => {
    if (base + block.text.length <= from) {
      return [];
    }
    const localFrom = Math.max(0, from - base);
    return segmentText(block.text, mode, localFrom, tuning).map((offset) => base + offset);
  });
}

/** Segments all spoken blocks in one mode. */
export function segment(blocks: readonly ScriptBlock[], mode: ChunkMode, options: PlanOptions): ChunkPlan {
  const stream = streamOf(blocks);
  return buildPlan(stream, mode, modeCuts(stream, mode, 0, options.tuning ?? DEFAULT_TUNING), [], options.newId);
}

interface Located {
  stream: Stream;
  cuts: number[];
  index: number;
}

function locate(blocks: readonly ScriptBlock[], plan: ChunkPlan, chunkId: string): Located | null {
  const index = plan.chunks.findIndex((chunk) => chunk.id === chunkId);
  if (index < 0) {
    return null;
  }
  const stream = streamOf(blocks);
  return { stream, cuts: cutsOf(stream, plan), index };
}

/** Snaps a block position to the nearest word start and converts it to a stream position. */
function snappedPosition(stream: Stream, at: BlockPosition): EditResult<number> {
  const entry = stream.blocks.find(({ block }) => block.id === at.blockId);
  if (entry === undefined) {
    return fail(ScriptEditError.NotSpoken);
  }
  const offset = snapToCut(entry.block.text, at.offset, MAX_SNAP_DISTANCE);
  return offset === null ? fail(ScriptEditError.NoBoundaryNearby) : ok(entry.base + offset);
}

/** Splits a chunk in two at `at` (snapped to a word start inside the chunk). */
export function splitChunk(
  blocks: readonly ScriptBlock[],
  plan: ChunkPlan,
  chunkId: string,
  at: BlockPosition,
  newId: IdFactory,
): EditResult<ChunkPlan> {
  const found = locate(blocks, plan, chunkId);
  if (found === null) {
    return fail(ScriptEditError.ChunkNotFound);
  }
  const { stream, cuts, index } = found;
  const position = snappedPosition(stream, at);
  if (!position.ok) {
    return position;
  }
  const start = cuts[index] ?? 0;
  const end = cuts[index + 1] ?? stream.end;
  if (position.value <= start || position.value >= end) {
    return fail(ScriptEditError.OutsideChunk);
  }
  return ok(buildPlan(stream, plan.mode, [...cuts, position.value], plan.chunks, newId));
}

/** Merges a chunk with the one after it (also across a paragraph break). */
export function mergeWithNext(
  blocks: readonly ScriptBlock[],
  plan: ChunkPlan,
  chunkId: string,
  newId: IdFactory,
): EditResult<ChunkPlan> {
  const found = locate(blocks, plan, chunkId);
  if (found === null) {
    return fail(ScriptEditError.ChunkNotFound);
  }
  const { stream, cuts, index } = found;
  if (index + 1 >= cuts.length) {
    return fail(ScriptEditError.LastChunk);
  }
  return ok(buildPlan(stream, plan.mode, cuts.filter((_, i) => i !== index + 1), plan.chunks, newId));
}

/** Moves the boundary at the start of `chunkId` (between it and the previous chunk) to `at`. */
export function moveBoundary(
  blocks: readonly ScriptBlock[],
  plan: ChunkPlan,
  chunkId: string,
  at: BlockPosition,
  newId: IdFactory,
): EditResult<ChunkPlan> {
  const found = locate(blocks, plan, chunkId);
  if (found === null) {
    return fail(ScriptEditError.ChunkNotFound);
  }
  const { stream, cuts, index } = found;
  if (index === 0) {
    return fail(ScriptEditError.FirstChunk);
  }
  const position = snappedPosition(stream, at);
  if (!position.ok) {
    return position;
  }
  const lower = cuts[index - 1] ?? 0;
  const upper = cuts[index + 1] ?? stream.end;
  if (position.value <= lower || position.value >= upper) {
    return fail(ScriptEditError.OutsideChunk);
  }
  return ok(buildPlan(stream, plan.mode, cuts.map((cut, i) => (i === index ? position.value : cut)), plan.chunks, newId));
}

/**
 * Re-segments from `chunkId` to the end in a new mode (mid-session "read less" / "read a full sentence").
 * Chunks before it are untouched, ids included; recorded takes stay linked (product brief §5, CHUNK SIZE).
 */
export function rechunkFrom(
  blocks: readonly ScriptBlock[],
  plan: ChunkPlan,
  chunkId: string,
  mode: ChunkMode,
  options: PlanOptions,
): EditResult<ChunkPlan> {
  const found = locate(blocks, plan, chunkId);
  if (found === null) {
    return fail(ScriptEditError.ChunkNotFound);
  }
  const { stream, cuts, index } = found;
  const start = cuts[index] ?? 0;
  const kept = cuts.slice(0, index);
  const fresh = modeCuts(stream, mode, start, options.tuning ?? DEFAULT_TUNING).filter((cut) => cut >= start);
  return ok(buildPlan(stream, mode, [...kept, start, ...fresh], plan.chunks, options.newId));
}

export const ProposalRejection = {
  NotSpoken: 'not_spoken',
  NoBoundaryNearby: 'no_boundary_nearby',
} as const;
export type ProposalRejection = (typeof ProposalRejection)[keyof typeof ProposalRejection];

export interface ProposalOutcome {
  plan: ChunkPlan;
  accepted: { proposal: BlockPosition; offset: number }[];
  rejected: { proposal: BlockPosition; reason: ProposalRejection }[];
}

/**
 * Applies AI boundary proposals (SPEC.md §B5 rule 5, §A6.6). The model only proposes offsets; each one is
 * snapped to the nearest word start within MAX_SNAP_DISTANCE or rejected. Paragraph breaks always stay cuts,
 * and no proposal can change or drop a word, because cuts never touch text.
 */
export function applyBoundaryProposals(
  blocks: readonly ScriptBlock[],
  mode: ChunkMode,
  proposals: readonly BlockPosition[],
  newId: IdFactory,
): ProposalOutcome {
  const stream = streamOf(blocks);
  const cuts = stream.blocks.flatMap(({ block, base }) => {
    const [start, end] = trimRange(block.text, 0, block.text.length);
    return start < end ? [base + start] : [];
  });
  const accepted: ProposalOutcome['accepted'] = [];
  const rejected: ProposalOutcome['rejected'] = [];
  for (const proposal of proposals) {
    const entry = stream.blocks.find(({ block }) => block.id === proposal.blockId);
    if (entry === undefined) {
      rejected.push({ proposal, reason: ProposalRejection.NotSpoken });
      continue;
    }
    const offset = Number.isInteger(proposal.offset) ? snapToCut(entry.block.text, proposal.offset, MAX_SNAP_DISTANCE) : null;
    if (offset === null) {
      rejected.push({ proposal, reason: ProposalRejection.NoBoundaryNearby });
      continue;
    }
    accepted.push({ proposal, offset });
    cuts.push(entry.base + offset);
  }
  return { plan: buildPlan(stream, mode, cuts, [], newId), accepted, rejected };
}

/** Exposed for coverage checks and tests: is this stream position a legal cut? */
export function isLegalCut(blocks: readonly ScriptBlock[], position: BlockPosition): boolean {
  const stream = streamOf(blocks);
  const streamPosition = toStream(stream, position);
  return streamPosition !== null && isStreamCut(stream, streamPosition);
}

/**
 * Builds chunks from client-sent ranges: text, spoken text and scene cue are always derived from the blocks,
 * never taken from the client. Run `checkCoverage` on the result before saving (SPEC.md Task 4).
 */
export function chunksFromRanges(blocks: readonly ScriptBlock[], inputs: readonly ChunkInput[], newId: IdFactory): ScriptChunk[] {
  const stream = streamOf(blocks);
  return inputs.map((input, order) => {
    const text = textOf(stream, input.ranges);
    const first = input.ranges[0];
    const cue = first === undefined ? undefined : stream.sceneCues.get(first.blockId);
    return {
      id: input.id ?? newId(),
      order,
      ranges: input.ranges.map((range) => ({ blockId: range.blockId, start: range.start, end: range.end })),
      text,
      spokenText: spokenTextOf(text),
      sceneCue:
        cue !== undefined && first !== undefined && isFirstChunkOfBlock(stream, first) ? { blockId: cue.id, text: cue.text } : null,
    };
  });
}
