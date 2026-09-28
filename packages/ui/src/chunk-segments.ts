// Splits a chunk's text into word and gap segments for highlighting (SPEC.md §B7 tiers).
// The segments always concatenate back to the exact chunk text (§A6.5: wording never changes).
import { ReadingState, type TextSpan } from '@repo/contracts';

export interface ChunkSegment {
  text: string;
  /** Index into the word spans, or null for the text between words. */
  word: number | null;
  state: ReadingState;
}

/** Word spans must be non-empty, in order, non-overlapping and inside the text. */
export function spansAreValid(text: string, words: readonly TextSpan[]): boolean {
  let previousEnd = 0;
  for (const span of words) {
    if (!Number.isInteger(span.charStart) || !Number.isInteger(span.charEnd)) return false;
    if (span.charStart < previousEnd || span.charEnd <= span.charStart || span.charEnd > text.length) return false;
    previousEnd = span.charEnd;
  }
  return true;
}

function wordState(chunk: ReadingState, index: number, currentWord: number | null): ReadingState {
  if (chunk !== ReadingState.Current || currentWord === null) return chunk;
  if (index < currentWord) return ReadingState.Spoken;
  return index === currentWord ? ReadingState.Current : ReadingState.Upcoming;
}

/**
 * Word-level segments, or null when the spans can't be trusted. Callers then fall back to the
 * `chunk` tier instead of guessing word positions (§A6.4: no fake word-level highlighting).
 * Gaps take the state of the word before them, so spoken text reads as one run.
 */
export function chunkSegments(
  text: string,
  words: readonly TextSpan[],
  chunk: ReadingState,
  currentWord: number | null,
): ChunkSegment[] | null {
  if (words.length === 0 || !spansAreValid(text, words)) return null;
  const segments: ChunkSegment[] = [];
  let cursor = 0;
  let gapState: ReadingState = wordState(chunk, 0, currentWord);
  words.forEach((span, index) => {
    if (span.charStart > cursor) {
      segments.push({ text: text.slice(cursor, span.charStart), word: null, state: gapState });
    }
    const state = wordState(chunk, index, currentWord);
    segments.push({ text: text.slice(span.charStart, span.charEnd), word: index, state });
    gapState = state === ReadingState.Current ? ReadingState.Upcoming : state;
    cursor = span.charEnd;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), word: null, state: gapState });
  return segments;
}
