// View helpers for the script review UI (SPEC.md Task 12). Pure; the model rules live in @repo/script-model.
import { BlockType, type ChunkInput, ChunkMode, type ScriptBlock, type ScriptBlockInput, type ScriptChunk } from '@repo/contracts';
import { ScriptEditError, wordsIn } from '@repo/script-model';
import type { MessageKey } from './message-key';

export interface ChunkWord {
  blockId: string;
  /** UTF-16 offsets into the block's text. */
  start: number;
  end: number;
  text: string;
  /** The text between the previous word and this one, verbatim (a space between ranges). */
  gapBefore: string;
}

/** A chunk's words with the exact text between them, so the rendering is the chunk text verbatim. */
export function chunkWords(blocks: readonly ScriptBlock[], chunk: ScriptChunk): ChunkWord[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  return chunk.ranges.flatMap((range, rangeIndex) => {
    const block = byId.get(range.blockId);
    if (block === undefined) return [];
    let previousEnd = range.start;
    return wordsIn(block.text, range.start, range.end).map((word, wordIndex) => {
      // Ranges are joined by one space (SPEC.md §B5 rule 3); inside a range the gap is verbatim.
      const rangeJoin = rangeIndex === 0 ? '' : ' ';
      const gap = wordIndex === 0 ? rangeJoin : block.text.slice(previousEnd, word.start);
      previousEnd = word.end;
      return { blockId: block.id, start: word.start, end: word.end, text: block.text.slice(word.start, word.end), gapBefore: gap };
    });
  });
}

/** What the server needs to rebuild the blocks: types + ranges, never text (SPEC.md Task 4). */
export function blockInputs(blocks: readonly ScriptBlock[]): ScriptBlockInput[] {
  return [...blocks]
    .sort((a, b) => a.order - b.order)
    .map((block) => ({
      type: block.type,
      start: block.source.start,
      end: block.source.end,
      ...(block.source.table === undefined ? {} : { table: block.source.table }),
      metadata: block.metadata,
    }));
}

/**
 * Chunk ranges for the saved script: the server assigns its own block ids, in the same order as the blocks we
 * sent, so each range's block id is mapped by position. Chunk ids are left to the server (a new script).
 */
export function planInputs(
  clientBlocks: readonly ScriptBlock[],
  serverBlocks: readonly ScriptBlock[],
  chunks: readonly ScriptChunk[],
): ChunkInput[] {
  const ordered = [...clientBlocks].sort((a, b) => a.order - b.order);
  const byOrder = [...serverBlocks].sort((a, b) => a.order - b.order);
  const serverId = new Map(ordered.map((block, index) => [block.id, byOrder[index]?.id ?? block.id]));
  return chunks.map((chunk) => ({
    ranges: chunk.ranges.map((range) => ({ ...range, blockId: serverId.get(range.blockId) ?? range.blockId })),
  }));
}

export const BLOCK_TYPE_LABEL: Record<BlockType, MessageKey> = {
  [BlockType.Spoken]: 'script.block_type.spoken',
  [BlockType.Heading]: 'script.block_type.heading',
  [BlockType.Note]: 'script.block_type.note',
  [BlockType.SceneCue]: 'script.block_type.scene_cue',
};

export const BLOCK_TYPE_CLASS: Record<BlockType, string> = {
  [BlockType.Spoken]: 'border-accent text-accent',
  [BlockType.Heading]: 'border-assistant text-assistant',
  [BlockType.Note]: 'border-line-strong text-ink-muted',
  [BlockType.SceneCue]: 'border-warning text-warning',
};

export const CHUNK_MODE_LABEL: Record<ChunkMode, MessageKey> = {
  [ChunkMode.Short]: 'script.mode.short',
  [ChunkMode.Sentence]: 'script.mode.sentence',
  [ChunkMode.Paragraph]: 'script.mode.paragraph',
  [ChunkMode.Smart]: 'script.mode.smart',
};

export const CHUNK_MODE_HINT: Record<ChunkMode, MessageKey> = {
  [ChunkMode.Short]: 'script.mode.short_hint',
  [ChunkMode.Sentence]: 'script.mode.sentence_hint',
  [ChunkMode.Paragraph]: 'script.mode.paragraph_hint',
  [ChunkMode.Smart]: 'script.mode.smart_hint',
};

export const EDIT_ERROR_MESSAGE: Record<ScriptEditError, MessageKey> = {
  [ScriptEditError.BlockNotFound]: 'script.edit_error.block_not_found',
  [ScriptEditError.ChunkNotFound]: 'script.edit_error.chunk_not_found',
  [ScriptEditError.NotSpoken]: 'script.edit_error.not_spoken',
  [ScriptEditError.NoBoundaryNearby]: 'script.edit_error.no_boundary_nearby',
  [ScriptEditError.OutsideChunk]: 'script.edit_error.outside_chunk',
  [ScriptEditError.FirstChunk]: 'script.edit_error.first_chunk',
  [ScriptEditError.LastChunk]: 'script.edit_error.last_chunk',
};
