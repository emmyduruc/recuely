// Text primitives. Offsets are UTF-16 code units (SPEC.md §B5 rule 1). Every cut position is a word start,
// so a cut never splits a word or a surrogate pair.

const WHITESPACE = /\s/;
const WHITESPACE_RUN = /\s+/g;
const WORD = /\S+/g;

export function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}

/** SPEC.md §B5 rule 3: NFC, collapse whitespace, trim. */
export function normalize(text: string): string {
  return text.normalize('NFC').replace(WHITESPACE_RUN, ' ').trim();
}

export function collapseWhitespace(text: string): string {
  return text.replace(WHITESPACE_RUN, ' ').trim();
}

/**
 * A valid chunk boundary: the first character of a whitespace-separated word. Never inside a token such as
 * `now—then`: chunks are rejoined with a space (SPEC.md §B5 rule 3), which would alter such a token.
 */
export function isCutPosition(text: string, offset: number): boolean {
  if (offset < 0 || offset >= text.length || isWhitespace(text.charAt(offset))) {
    return false;
  }
  return offset === 0 || isWhitespace(text.charAt(offset - 1));
}

/** Nearest cut position within `maxDistance`, preferring later positions on ties; null if none. */
export function snapToCut(text: string, offset: number, maxDistance: number): number | null {
  for (let distance = 0; distance <= maxDistance; distance += 1) {
    if (isCutPosition(text, offset + distance)) {
      return offset + distance;
    }
    if (distance > 0 && isCutPosition(text, offset - distance)) {
      return offset - distance;
    }
  }
  return null;
}

/** First non-whitespace offset at or after `from`, or `text.length`. */
export function skipWhitespace(text: string, from: number): number {
  let offset = from;
  while (offset < text.length && isWhitespace(text.charAt(offset))) {
    offset += 1;
  }
  return offset;
}

/** `[start, end)` shrunk so it neither starts nor ends in whitespace (may become empty). */
export function trimRange(text: string, start: number, end: number): [number, number] {
  let from = start;
  let to = end;
  while (from < to && isWhitespace(text.charAt(from))) {
    from += 1;
  }
  while (to > from && isWhitespace(text.charAt(to - 1))) {
    to -= 1;
  }
  return [from, to];
}

export interface WordSpan {
  start: number;
  end: number;
}

export function wordsIn(text: string, start = 0, end = text.length): WordSpan[] {
  const slice = text.slice(start, end);
  return Array.from(slice.matchAll(WORD), (match) => ({
    start: start + match.index,
    end: start + match.index + match[0].length,
  }));
}

export function countWords(text: string, start = 0, end = text.length): number {
  return wordsIn(text, start, end).length;
}

// Markdown emphasis is removed from spoken text only (SPEC.md §B5 rule 4); `text` keeps it verbatim.
// Markers only count at word edges, so `snake_case`, `2*3*4` and `a**b` are left alone.
const STRONG = /(^|[^\p{L}\p{N}*_])(\*\*|__)(?=[^\s*_])([^]*?[^\s*_])\2(?![\p{L}\p{N}*_])/gu;
const EM_STAR = /(^|[^\p{L}\p{N}*])\*(?=[^\s*])([^*]*?[^\s*])\*(?![\p{L}\p{N}*])/gu;
const EM_UNDERSCORE = /(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_]*?[^\s_])_(?![\p{L}\p{N}_])/gu;

export function stripEmphasis(text: string): string {
  return text.replace(STRONG, '$1$3').replace(EM_STAR, '$1$2').replace(EM_UNDERSCORE, '$1$2');
}

/** What the assistant reads: whitespace collapsed, emphasis markers removed, wording unchanged. */
export function spokenTextOf(text: string): string {
  return collapseWhitespace(stripEmphasis(text));
}
