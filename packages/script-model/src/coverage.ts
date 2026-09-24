import { BlockType, type ScriptBlock, type ScriptChunk } from '@repo/contracts';
import { isWhitespace, normalize, spokenTextOf } from './text.ts';

// Independent check of SPEC.md §B5 rules 2–4 for chunks from anywhere (DB, API, AI, UI). Plans built by this
// package satisfy it by construction; the server runs it again before saving (Task 4).

export const CoverageIssueCode = {
  UnknownBlock: 'unknown_block',
  InvalidRange: 'invalid_range',
  EmptyChunk: 'empty_chunk',
  OutOfOrder: 'out_of_order',
  Uncovered: 'uncovered',
  CoveredTwice: 'covered_twice',
  TextMismatch: 'text_mismatch',
  SpokenTextMismatch: 'spoken_text_mismatch',
  WordingChanged: 'wording_changed',
  DuplicateId: 'duplicate_id',
} as const;
export type CoverageIssueCode = (typeof CoverageIssueCode)[keyof typeof CoverageIssueCode];

export interface CoverageIssue {
  code: CoverageIssueCode;
  chunkId?: string;
  blockId?: string;
  offset?: number;
}

export class CoverageError extends Error {
  override name = 'CoverageError';
  readonly issues: CoverageIssue[];

  constructor(issues: CoverageIssue[]) {
    super(`Chunks do not preserve the spoken text: ${issues.map((issue) => issue.code).join(', ')}`);
    this.issues = issues;
  }
}

function spokenBlocks(blocks: readonly ScriptBlock[]): ScriptBlock[] {
  return blocks.filter((block) => block.type === BlockType.Spoken).sort((a, b) => a.order - b.order);
}

/** Every problem found; empty when the chunks preserve the spoken text exactly. */
export function checkCoverage(blocks: readonly ScriptBlock[], chunks: readonly ScriptChunk[]): CoverageIssue[] {
  const issues: CoverageIssue[] = [];
  const spoken = spokenBlocks(blocks);
  const byId = new Map(spoken.map((block) => [block.id, block]));
  const rank = new Map(spoken.map((block, index) => [block.id, index]));
  const counts = new Map(spoken.map((block) => [block.id, new Array<number>(block.text.length).fill(0)]));
  const seenIds = new Set<string>();
  let lastPosition: [number, number] = [-1, -1];

  for (const chunk of chunks) {
    if (seenIds.has(chunk.id)) {
      issues.push({ code: CoverageIssueCode.DuplicateId, chunkId: chunk.id });
    }
    seenIds.add(chunk.id);
    if (chunk.ranges.length === 0) {
      issues.push({ code: CoverageIssueCode.EmptyChunk, chunkId: chunk.id });
    }
    const pieces: string[] = [];
    for (const range of chunk.ranges) {
      const block = byId.get(range.blockId);
      const counter = counts.get(range.blockId);
      const blockRank = rank.get(range.blockId);
      if (block === undefined || counter === undefined || blockRank === undefined) {
        issues.push({ code: CoverageIssueCode.UnknownBlock, chunkId: chunk.id, blockId: range.blockId });
        continue;
      }
      if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end > block.text.length || range.start >= range.end) {
        issues.push({ code: CoverageIssueCode.InvalidRange, chunkId: chunk.id, blockId: block.id });
        continue;
      }
      const [lastRank, lastOffset] = lastPosition;
      if (blockRank < lastRank || (blockRank === lastRank && range.start < lastOffset)) {
        issues.push({ code: CoverageIssueCode.OutOfOrder, chunkId: chunk.id, blockId: block.id, offset: range.start });
      }
      lastPosition = [blockRank, range.end];
      for (let offset = range.start; offset < range.end; offset += 1) {
        counter[offset] = (counter[offset] ?? 0) + 1;
      }
      pieces.push(block.text.slice(range.start, range.end));
    }
    const text = pieces.join(' ');
    if (chunk.text !== text) {
      issues.push({ code: CoverageIssueCode.TextMismatch, chunkId: chunk.id });
    }
    if (chunk.spokenText !== spokenTextOf(chunk.text)) {
      issues.push({ code: CoverageIssueCode.SpokenTextMismatch, chunkId: chunk.id });
    }
  }

  for (const block of spoken) {
    const counter = counts.get(block.id) ?? [];
    for (let offset = 0; offset < block.text.length; offset += 1) {
      if (isWhitespace(block.text.charAt(offset))) {
        continue;
      }
      const count = counter[offset] ?? 0;
      if (count !== 1) {
        issues.push({
          code: count === 0 ? CoverageIssueCode.Uncovered : CoverageIssueCode.CoveredTwice,
          blockId: block.id,
          offset,
        });
        break;
      }
    }
  }

  const original = normalize(spoken.map((block) => block.text).join(' '));
  const reassembled = normalize(chunks.map((chunk) => chunk.text).join(' '));
  if (original !== reassembled) {
    issues.push({ code: CoverageIssueCode.WordingChanged });
  }
  return issues;
}

/** Throws `CoverageError` unless the chunks preserve the spoken text exactly. */
export function assertCoverage(blocks: readonly ScriptBlock[], chunks: readonly ScriptChunk[]): void {
  const issues = checkCoverage(blocks, chunks);
  if (issues.length > 0) {
    throw new CoverageError(issues);
  }
}
