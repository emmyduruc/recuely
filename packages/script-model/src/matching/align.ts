import { MatchDecision, type MatchResult, type MatchThresholds, type TextSpan } from '@repo/contracts';
import { type MatchToken, matchTokens } from './normalize.ts';

// Transcript ↔ chunk alignment and the advance decision (SPEC.md §B7):
//   advance iff coverage ≥ thresholds.coverage ∧ similarity ≥ thresholds.similarity ∧ the ending was heard.
// Thresholds always come from the caller (the user's settings); nothing here hard-codes them.

/** Words this long or longer may differ slightly ("colour"/"color", STT spelling slips). */
const FUZZY_MIN_LENGTH = 4;
const FUZZY_MIN_RATIO = 0.8;
/** §B7 "last chunk tokens (±2) covered": the last heard chunk word is among the final three. */
export const END_TOLERANCE = 2;

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

export function wordsMatch(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const shorter = Math.min(a.length, b.length);
  if (shorter < FUZZY_MIN_LENGTH) {
    return false;
  }
  return 1 - editDistance(a, b) / Math.max(a.length, b.length) >= FUZZY_MIN_RATIO;
}

/** Longest common subsequence under `wordsMatch`; returns matched index pairs in order. */
export function alignWords(reference: readonly string[], heard: readonly string[]): [number, number][] {
  const n = reference.length;
  const m = heard.length;
  const table = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const at = (i: number, j: number): number => table[i]?.[j] ?? 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = table[i];
    for (let j = m - 1; j >= 0 && row !== undefined; j -= 1) {
      row[j] = wordsMatch(reference[i] ?? '', heard[j] ?? '') ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (wordsMatch(reference[i] ?? '', heard[j] ?? '') && at(i, j) === at(i + 1, j + 1) + 1) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/** Share of `heard` words found, in order, in `reference` (1 = everything heard is in the reference). */
export function containment(reference: string, heard: string): number {
  const heardWords = matchTokens(heard).map((token) => token.text);
  if (heardWords.length === 0) {
    return 0;
  }
  const referenceWords = matchTokens(reference).map((token) => token.text);
  return alignWords(referenceWords, heardWords).length / heardWords.length;
}

/** Unmatched chunk tokens, merged into spans of the chunk text (UTF-16). */
function missingSpans(tokens: readonly MatchToken[], matched: ReadonlySet<number>): TextSpan[] {
  // Group tokens by the source word they came from ("we're" → two tokens, one word); a word is missing only
  // if none of its tokens was heard. Consecutive missing words merge into one span.
  const words: { start: number; end: number; heard: boolean }[] = [];
  tokens.forEach((token, index) => {
    const last = words.at(-1);
    if (last?.start === token.start) {
      last.end = Math.max(last.end, token.end);
      last.heard ||= matched.has(index);
    } else {
      words.push({ start: token.start, end: token.end, heard: matched.has(index) });
    }
  });
  const spans: TextSpan[] = [];
  let previousMissing = false;
  for (const word of words) {
    const last = spans.at(-1);
    if (!word.heard && previousMissing && last !== undefined) {
      last.charEnd = word.end;
    } else if (!word.heard) {
      spans.push({ charStart: word.start, charEnd: word.end });
    }
    previousMissing = !word.heard;
  }
  return spans;
}

const round = (value: number): number => Math.round(value * 100) / 100;
const fixed = (value: number): string => value.toFixed(2);

/**
 * Compares a take's transcript with its chunk. `chunkText` is the chunk's spoken text; `missingSpans` point
 * into it. Similarity is Dice over matched words, so extra words lower it as much as missing ones.
 */
export function matchTranscript(chunkText: string, transcript: string, thresholds: MatchThresholds): MatchResult {
  const chunk = matchTokens(chunkText);
  const heard = matchTokens(transcript).map((token) => token.text);
  const pairs = alignWords(
    chunk.map((token) => token.text),
    heard,
  );
  const matched = new Set(pairs.map(([index]) => index));
  const coverage = chunk.length === 0 ? 1 : pairs.length / chunk.length;
  const total = chunk.length + heard.length;
  const similarity = total === 0 ? 1 : (2 * pairs.length) / total;
  const lastHeard = Math.max(-1, ...matched);
  const endingHeard = chunk.length === 0 || lastHeard >= chunk.length - 1 - END_TOLERANCE;

  const coverageOk = coverage >= thresholds.coverage;
  const similarityOk = similarity >= thresholds.similarity;
  const reasons = [
    heard.length === 0 ? 'nothing was heard' : null,
    `coverage ${fixed(coverage)} ${coverageOk ? '≥' : '<'} ${fixed(thresholds.coverage)}`,
    `similarity ${fixed(similarity)} ${similarityOk ? '≥' : '<'} ${fixed(thresholds.similarity)}`,
    endingHeard ? 'ending heard' : 'ending not heard',
  ].filter((reason): reason is string => reason !== null);

  return {
    coverage: round(coverage),
    similarity: round(similarity),
    missingSpans: missingSpans(chunk, matched),
    decision: coverageOk && similarityOk && endingHeard ? MatchDecision.Advance : MatchDecision.Ask,
    reasons,
  };
}
