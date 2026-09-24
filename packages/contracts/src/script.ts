// Script document contract (SPEC.md §B4, product brief "Internal document contract").
// All offsets are UTF-16 code units (SPEC.md §B5 rule 1).

export const BlockType = {
  Spoken: 'spoken',
  Heading: 'heading',
  Note: 'note',
  SceneCue: 'scene_cue',
} as const;
export type BlockType = (typeof BlockType)[keyof typeof BlockType];

export const ChunkMode = {
  Short: 'short',
  Sentence: 'sentence',
  Paragraph: 'paragraph',
  Smart: 'smart',
} as const;
export type ChunkMode = (typeof ChunkMode)[keyof typeof ChunkMode];

/** Where a table cell came from. `header` is the column's header text, if the table has one. */
export interface TableCellSource {
  index: number;
  row: number;
  column: number;
  header: string | null;
}

/** Range of the block's text in the original source; `source.slice(start, end) === block.text`. */
export interface BlockSource {
  start: number;
  end: number;
  table?: TableCellSource;
}

export interface BlockMetadata {
  /** Markup removed from around the text, e.g. `## `, `Note: `, `[`, `- `. */
  marker?: string;
  /** The block is a table header cell. */
  tableHeader?: boolean;
}

export interface ScriptBlock {
  id: string;
  order: number;
  type: BlockType;
  text: string;
  source: BlockSource;
  metadata: BlockMetadata;
}

/** A range of one spoken block's text. */
export interface ChunkRange {
  blockId: string;
  start: number;
  end: number;
}

/** The scene cue a chunk follows; spoken only if the user opts in, never part of the take (R1.1). */
export interface SceneCueRef {
  blockId: string;
  text: string;
}

export interface ScriptChunk {
  id: string;
  order: number;
  ranges: ChunkRange[];
  /** The covered text, verbatim (ranges joined by a space). */
  text: string;
  /** `text` with whitespace collapsed and markdown emphasis markers removed (SPEC.md §B5 rule 4). */
  spokenText: string;
  sceneCue: SceneCueRef | null;
}

export interface ChunkPlan {
  mode: ChunkMode;
  chunks: ScriptChunk[];
}
