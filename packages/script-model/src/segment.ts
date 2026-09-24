import { ChunkMode, Locale } from '@repo/contracts';
import { countWords, isCutPosition, skipWhitespace, trimRange, wordsIn } from './text.ts';

// Deterministic segmentation (SPEC.md Task 3). Each mode returns the cut offsets for one block's text from
// `from` onwards; a chunk runs from one cut to the next. AI (Ollama) may later propose cuts, but those go
// through `applyBoundaryProposals`, never through here.

/** Word budgets per mode. Provisional; revised from the Task 19 baseline. */
export interface SegmentationTuning {
  shortMaxWords: number;
  shortMinWords: number;
  smartMaxWords: number;
  smartMinWords: number;
  /** Smart mode merges neighbouring sentences shorter than this… */
  smartMergeBelow: number;
  /** …as long as the merged chunk stays within this many words. */
  smartMergeMax: number;
}

export const DEFAULT_TUNING: SegmentationTuning = {
  shortMaxWords: 8,
  shortMinWords: 3,
  smartMaxWords: 16,
  smartMinWords: 4,
  smartMergeBelow: 6,
  smartMergeMax: 12,
};

interface Unit {
  start: number;
  end: number;
  words: number;
}

const sentenceSegmenter = new Intl.Segmenter(Locale.En, { granularity: 'sentence' });

/** A sentence "ending" in one of these isn't the end of a sentence: "Dr. Smith", "e.g. this". */
const ABBREVIATION = /(?:^|[\s(])(?:mr|mrs|ms|dr|prof|st|vs|etc|e\.g|i\.e|no|approx|jr|sr|inc|ltd|fig|vol)\.$/i;
const INITIAL = /(?:^|\s)[A-Z]\.$/;
/** Clause punctuation a breath group may end on. */
const CLAUSE_END = new Set([',', ';', ':', '—', '–']);
/** Closing quotes/brackets after the punctuation don't hide it: `said,”` still ends a clause. */
const CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '»']);

function unit(text: string, start: number, end: number): Unit {
  return { start, end, words: countWords(text, start, end) };
}

function sentences(text: string, from: number): Unit[] {
  const units: Unit[] = [];
  for (const segment of sentenceSegmenter.segment(text.slice(from))) {
    const [start, end] = trimRange(text, from + segment.index, from + segment.index + segment.segment.length);
    if (start >= end) {
      continue;
    }
    const last = units.at(-1);
    const lastText = last === undefined ? '' : text.slice(last.start, last.end);
    if (last !== undefined && (ABBREVIATION.test(lastText) || INITIAL.test(lastText) || !isCutPosition(text, start))) {
      units[units.length - 1] = unit(text, last.start, end);
    } else {
      units.push(unit(text, start, end));
    }
  }
  return units;
}

function endsClause(text: string, wordEnd: number): boolean {
  let index = wordEnd - 1;
  while (index > 0 && CLOSERS.has(text.charAt(index))) {
    index -= 1;
  }
  return CLAUSE_END.has(text.charAt(index));
}

/** Splits a sentence after clause punctuation (`,` `;` `:` and spaced dashes). */
function clauses(text: string, sentence: Unit): Unit[] {
  const cuts = [sentence.start];
  const words = wordsIn(text, sentence.start, sentence.end);
  words.forEach((word, index) => {
    const previous = words[index - 1];
    if (previous !== undefined && endsClause(text, previous.end)) {
      cuts.push(word.start);
    }
  });
  return cuts.map((cut, index) => unit(text, cut, cuts[index + 1] ?? sentence.end)).map((piece) => {
    const [start, end] = trimRange(text, piece.start, piece.end);
    return unit(text, start, end);
  });
}

/** Splits a unit longer than `max` words into near-equal parts at word starts. */
function hardSplit(text: string, piece: Unit, max: number): Unit[] {
  if (piece.words <= max) {
    return [piece];
  }
  const words = wordsIn(text, piece.start, piece.end);
  const parts = Math.ceil(words.length / max);
  const size = Math.ceil(words.length / parts);
  const starts = words.filter((_, index) => index % size === 0).map((word) => word.start);
  return starts.map((start, index) => {
    const nextStart = starts[index + 1];
    const [from, to] = trimRange(text, start, nextStart ?? piece.end);
    return unit(text, from, to);
  });
}

/** Greedy packing into groups of at most `max` words; a too-short tail joins the previous group. */
function pack(text: string, pieces: readonly Unit[], max: number, min: number): Unit[] {
  const groups: Unit[] = [];
  for (const piece of pieces) {
    const last = groups.at(-1);
    if (last !== undefined && last.words + piece.words <= max) {
      groups[groups.length - 1] = unit(text, last.start, piece.end);
    } else {
      groups.push(piece);
    }
  }
  const tail = groups.at(-1);
  const beforeTail = groups.at(-2);
  if (tail !== undefined && beforeTail !== undefined && tail.words < min && beforeTail.words + tail.words <= max + min) {
    groups.splice(-2, 2, unit(text, beforeTail.start, tail.end));
  }
  return groups;
}

function breathGroups(text: string, sentence: Unit, max: number, min: number): Unit[] {
  return pack(text, clauses(text, sentence).flatMap((piece) => hardSplit(text, piece, max)), max, min);
}

type ModeSegmenter = (text: string, from: number, tuning: SegmentationTuning) => Unit[];

const MODE: Record<ChunkMode, ModeSegmenter> = {
  [ChunkMode.Paragraph]: (text, from) => {
    const start = skipWhitespace(text, from);
    const [, end] = trimRange(text, start, text.length);
    return start < end ? [unit(text, start, end)] : [];
  },
  [ChunkMode.Sentence]: (text, from) => sentences(text, from),
  [ChunkMode.Short]: (text, from, tuning) =>
    sentences(text, from).flatMap((sentence) => breathGroups(text, sentence, tuning.shortMaxWords, tuning.shortMinWords)),
  [ChunkMode.Smart]: (text, from, tuning) => {
    const units = sentences(text, from).flatMap((sentence) =>
      sentence.words <= tuning.smartMaxWords
        ? [sentence]
        : breathGroups(text, sentence, tuning.smartMaxWords, tuning.smartMinWords),
    );
    const merged: Unit[] = [];
    for (const next of units) {
      const last = merged.at(-1);
      const canMerge =
        last !== undefined &&
        last.words < tuning.smartMergeBelow &&
        next.words < tuning.smartMergeBelow &&
        last.words + next.words <= tuning.smartMergeMax;
      if (last !== undefined && canMerge) {
        merged[merged.length - 1] = unit(text, last.start, next.end);
      } else {
        merged.push(next);
      }
    }
    return merged;
  },
};

/** Cut offsets for `text` from `from` onwards in the given mode. Every offset is a word start. */
export function segmentText(
  text: string,
  mode: ChunkMode,
  from = 0,
  tuning: SegmentationTuning = DEFAULT_TUNING,
): number[] {
  const first = skipWhitespace(text, from);
  const cuts = MODE[mode](text, from, tuning)
    .map((piece) => piece.start)
    .filter((cut) => cut === first || isCutPosition(text, cut));
  return [...new Set(cuts)].sort((a, b) => a - b);
}
