// Table detection for pasted scripts: GitHub-style pipe tables and tab-separated rows (from Docs/Sheets).
// Each cell keeps its exact source range so provenance (table, row, column) survives (product brief §C).

export interface SourceLine {
  text: string;
  /** Offset of the line's first character in the source. */
  start: number;
}

export interface TableCell {
  text: string;
  start: number;
  end: number;
}

export interface ParsedTable {
  firstLine: number;
  lastLine: number;
  /** Row 0 is the header row when `hasHeader`. Empty cells are null. */
  rows: (TableCell | null)[][];
  hasHeader: boolean;
}

const PIPE = '|';
const BACKSLASH = '\\';
const TAB = '\t';
const PIPE_ROW = /^\s*\|/;
const PIPE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const HAS_PIPE = /\|/;

/** Header words that mark the column the creator speaks. */
const SPOKEN_HEADER = /\b(script|lines?|dialogue|voice[\s-]?over|vo|narration|spoken|say|says|text|copy|words|read)\b/i;
/** Timestamps and row numbers are never spoken (product brief §C). */
const DATA_CELL = /^\(?(\d{1,2}:\d{2}(:\d{2})?|\d+[.)]?)\)?$/;

function cellAt(line: SourceLine, from: number, to: number): TableCell | null {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(line.text.charAt(start))) {
    start += 1;
  }
  while (end > start && /\s/.test(line.text.charAt(end - 1))) {
    end -= 1;
  }
  return start === end ? null : { text: line.text.slice(start, end), start: line.start + start, end: line.start + end };
}

function splitPipeRow(line: SourceLine): (TableCell | null)[] {
  const pipes: number[] = [];
  for (let i = 0; i < line.text.length; i += 1) {
    if (line.text.charAt(i) === PIPE && line.text.charAt(i - 1) !== BACKSLASH) {
      pipes.push(i);
    }
  }
  const bounds = [-1, ...pipes, line.text.length];
  const cells: (TableCell | null)[] = [];
  for (let k = 0; k + 1 < bounds.length; k += 1) {
    const from = (bounds[k] ?? 0) + 1;
    const to = bounds[k + 1] ?? line.text.length;
    const isOuter = k === 0 || k === bounds.length - 2;
    const cell = cellAt(line, from, to);
    if (!(isOuter && cell === null)) {
      cells.push(cell);
    }
  }
  return cells;
}

function splitTabRow(line: SourceLine): (TableCell | null)[] {
  const cells: (TableCell | null)[] = [];
  let from = 0;
  for (let i = 0; i <= line.text.length; i += 1) {
    if (i === line.text.length || line.text.charAt(i) === TAB) {
      cells.push(cellAt(line, from, i));
      from = i + 1;
    }
  }
  return cells;
}

function isTabRow(line: SourceLine): boolean {
  return line.text.includes(TAB) && splitTabRow(line).some((cell) => cell !== null);
}

/** Finds every table; lines inside a table are not parsed as paragraphs. */
export function detectTables(lines: readonly SourceLine[]): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line !== undefined && next !== undefined && PIPE_ROW.test(line.text) && PIPE_SEPARATOR.test(next.text) && HAS_PIPE.test(next.text)) {
      const rows = [splitPipeRow(line)];
      let j = i + 2;
      for (let row = lines[j]; row !== undefined && PIPE_ROW.test(row.text); row = lines[j]) {
        rows.push(splitPipeRow(row));
        j += 1;
      }
      tables.push({ firstLine: i, lastLine: j - 1, rows, hasHeader: true });
      i = j;
      continue;
    }
    if (line !== undefined && isTabRow(line)) {
      const width = splitTabRow(line).length;
      let j = i;
      for (let row = lines[j]; row !== undefined && isTabRow(row) && splitTabRow(row).length === width; row = lines[j]) {
        j += 1;
      }
      if (j - i >= 2) {
        tables.push({ firstLine: i, lastLine: j - 1, rows: lines.slice(i, j).map(splitTabRow), hasHeader: true });
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return tables;
}

function bodyRows(table: ParsedTable): (TableCell | null)[][] {
  return table.hasHeader ? table.rows.slice(1) : table.rows;
}

function columnCells(table: ParsedTable, column: number): TableCell[] {
  return bodyRows(table).flatMap((row) => {
    const cell = row[column];
    return cell === undefined || cell === null ? [] : [cell];
  });
}

function isDataColumn(cells: readonly TableCell[]): boolean {
  const data = cells.filter((cell) => DATA_CELL.test(cell.text)).length;
  return cells.length > 0 && data * 2 >= cells.length;
}

/**
 * The column read aloud by default: the first whose header names spoken text, otherwise the one with the
 * longest cells. Timestamp/number columns never qualify. The user can re-type any cell afterwards.
 */
export function spokenColumn(table: ParsedTable): number | null {
  const width = Math.max(0, ...table.rows.map((row) => row.length));
  const candidates = Array.from({ length: width }, (_, column) => column).filter((column) => {
    const cells = columnCells(table, column);
    return cells.length > 0 && !isDataColumn(cells);
  });
  const header = table.hasHeader ? table.rows[0] : undefined;
  const named = candidates.find((column) => SPOKEN_HEADER.test(header?.[column]?.text ?? ''));
  if (named !== undefined) {
    return named;
  }
  let best: number | null = null;
  let bestLength = -1;
  for (const column of candidates) {
    const cells = columnCells(table, column);
    const average = cells.reduce((sum, cell) => sum + cell.text.length, 0) / cells.length;
    if (average > bestLength) {
      best = column;
      bestLength = average;
    }
  }
  return best;
}
