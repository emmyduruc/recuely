import { type BlockMetadata, type BlockSource, BlockType, type ScriptBlock } from '@repo/contracts';
import type { IdFactory } from './result.ts';
import { detectTables, type ParsedTable, type SourceLine, spokenColumn } from './table.ts';

// Paste parser → ScriptBlock[] (SPEC.md Task 3). Rules, line by line:
//   `# Title`              heading         (1–6 #)
//   `Note: …`              note
//   `[ … ]` (whole line)   scene_cue       e.g. `[Scene 2: show the product screen]`
//   `- item` / `* item`    spoken block per bullet
//   pipe / tab tables      one block per cell with row/column provenance
//   anything else          spoken; consecutive lines form one paragraph, blank lines separate them
// Invariant: `source.slice(block.source.start, block.source.end) === block.text`. The parser only decides
// where blocks start and end; it never rewrites wording (SPEC.md §A6.5).

const LINE_BREAK = /\r\n|\n|\r/g;
const BLANK = /^\s*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(\S(?:.*\S)?)\s*$/d;
const NOTE = /^\s*(notes?[ \t]*:)[ \t]*(\S(?:.*\S)?)\s*$/di;
const SCENE_CUE = /^\s*(\[)[ \t]*([^\]]*[^\]\s])[ \t]*\]\s*$/d;
const BULLET = /^\s*([-*•])[ \t]+(\S(?:.*\S)?)\s*$/d;
const CONTENT = /\S(?:.*\S)?/d;

interface Draft {
  type: BlockType;
  source: BlockSource;
  metadata: BlockMetadata;
}

export interface ParseOptions {
  newId: IdFactory;
}

export function splitLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (const match of source.matchAll(LINE_BREAK)) {
    lines.push({ text: source.slice(start, match.index), start });
    start = match.index + match[0].length;
  }
  lines.push({ text: source.slice(start), start });
  return lines;
}

/** Range of capture group `group` in source coordinates. */
function groupRange(match: RegExpExecArray, group: number, lineStart: number): [number, number] | null {
  const range = match.indices?.[group];
  return range === undefined ? null : [lineStart + range[0], lineStart + range[1]];
}

/** A line with a marker (`## `, `Note: `, `[`, `- `): the block is the content group, the marker is kept. */
function markedLine(line: SourceLine, pattern: RegExp, type: BlockType, source: string): Draft | null {
  const match = pattern.exec(line.text);
  if (match === null) {
    return null;
  }
  const content = groupRange(match, 2, line.start);
  const marker = groupRange(match, 1, line.start);
  if (content === null || marker === null) {
    return null;
  }
  return {
    type,
    source: { start: content[0], end: content[1] },
    metadata: { marker: source.slice(marker[0], content[0]) },
  };
}

/** Header cells are headings; in the body only the spoken column is read, the rest are notes. */
function cellType(isHeader: boolean, isSpoken: boolean): BlockType {
  if (isHeader) {
    return BlockType.Heading;
  }
  return isSpoken ? BlockType.Spoken : BlockType.Note;
}

function tableDrafts(table: ParsedTable, index: number): Draft[] {
  const spoken = spokenColumn(table);
  const header = table.hasHeader ? table.rows[0] : undefined;
  return table.rows.flatMap((row, rowIndex) =>
    row.flatMap((cell, column) => {
      if (cell === null) {
        return [];
      }
      const isHeader = table.hasHeader && rowIndex === 0;
      const type = cellType(isHeader, column === spoken);
      return [
        {
          type,
          source: {
            start: cell.start,
            end: cell.end,
            table: { index, row: rowIndex, column, header: header?.[column]?.text ?? null },
          },
          metadata: isHeader ? { tableHeader: true } : {},
        },
      ];
    }),
  );
}

function classify(line: SourceLine, source: string): Draft | null {
  return (
    markedLine(line, HEADING, BlockType.Heading, source) ??
    markedLine(line, NOTE, BlockType.Note, source) ??
    markedLine(line, SCENE_CUE, BlockType.SceneCue, source) ??
    markedLine(line, BULLET, BlockType.Spoken, source)
  );
}

/** Parses pasted text into ordered blocks. */
export function parseScript(source: string, { newId }: ParseOptions): ScriptBlock[] {
  const lines = splitLines(source);
  const tablesByFirstLine = new Map(detectTables(lines).map((table) => [table.firstLine, table]));
  const drafts: Draft[] = [];
  let paragraph: [number, number] | null = null;
  let tableCount = 0;

  const flush = (): void => {
    if (paragraph !== null) {
      drafts.push({ type: BlockType.Spoken, source: { start: paragraph[0], end: paragraph[1] }, metadata: {} });
      paragraph = null;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    const table = tablesByFirstLine.get(i);
    if (table !== undefined) {
      flush();
      drafts.push(...tableDrafts(table, tableCount));
      tableCount += 1;
      i = table.lastLine;
      continue;
    }
    if (BLANK.test(line.text)) {
      flush();
      continue;
    }
    const marked = classify(line, source);
    if (marked !== null) {
      flush();
      drafts.push(marked);
      continue;
    }
    const content = CONTENT.exec(line.text);
    const range = content === null ? null : groupRange(content, 0, line.start);
    if (range !== null) {
      paragraph = paragraph === null ? range : [paragraph[0], range[1]];
    }
  }
  flush();

  return drafts.map((draft, order) => ({
    id: newId(),
    order,
    type: draft.type,
    text: source.slice(draft.source.start, draft.source.end),
    source: draft.source,
    metadata: draft.metadata,
  }));
}
