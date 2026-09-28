import { numberTokenWords } from './numbers.ts';

// Match normalization (SPEC.md §B7): case, punctuation, diacritics, numbers, contractions. Script text and STT
// transcripts go through the same function, so their tokens compare directly. Every token keeps the UTF-16
// range of the source word it came from ("we're" → "we", "are", both pointing at "we're").

export interface MatchToken {
  text: string;
  start: number;
  end: number;
}

/** A word: letters/digits with inner apostrophes, decimals or thousands separators; or a standalone `&`. */
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:[.,]\p{N}+)*|&/gu;
const COMBINING_MARKS = /\p{M}/gu;
const APOSTROPHES = /['’]/g;
const PERCENT = '%';
const AMPERSAND = '&';

/** Expanded identically on both sides; unknown `'s` possessives just lose the apostrophe. */
const CONTRACTIONS: Readonly<Record<string, readonly string[]>> = {
  "i'm": ['i', 'am'],
  "you're": ['you', 'are'],
  "we're": ['we', 'are'],
  "they're": ['they', 'are'],
  "it's": ['it', 'is'],
  "that's": ['that', 'is'],
  "there's": ['there', 'is'],
  "here's": ['here', 'is'],
  "what's": ['what', 'is'],
  "who's": ['who', 'is'],
  "he's": ['he', 'is'],
  "she's": ['she', 'is'],
  "let's": ['let', 'us'],
  "i've": ['i', 'have'],
  "you've": ['you', 'have'],
  "we've": ['we', 'have'],
  "they've": ['they', 'have'],
  "i'll": ['i', 'will'],
  "you'll": ['you', 'will'],
  "we'll": ['we', 'will'],
  "they'll": ['they', 'will'],
  "he'll": ['he', 'will'],
  "she'll": ['she', 'will'],
  "it'll": ['it', 'will'],
  "i'd": ['i', 'would'],
  "you'd": ['you', 'would'],
  "we'd": ['we', 'would'],
  "they'd": ['they', 'would'],
  "don't": ['do', 'not'],
  "doesn't": ['does', 'not'],
  "didn't": ['did', 'not'],
  "can't": ['can', 'not'],
  cannot: ['can', 'not'],
  "won't": ['will', 'not'],
  "isn't": ['is', 'not'],
  "aren't": ['are', 'not'],
  "wasn't": ['was', 'not'],
  "weren't": ['were', 'not'],
  "haven't": ['have', 'not'],
  "hasn't": ['has', 'not'],
  "hadn't": ['had', 'not'],
  "wouldn't": ['would', 'not'],
  "shouldn't": ['should', 'not'],
  "couldn't": ['could', 'not'],
  gonna: ['going', 'to'],
  wanna: ['want', 'to'],
  gotta: ['got', 'to'],
};

function fold(word: string): string {
  return word.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(APOSTROPHES, "'");
}

function expand(word: string): readonly string[] {
  if (word === AMPERSAND) {
    return ['and'];
  }
  return CONTRACTIONS[word] ?? numberTokenWords(word) ?? [word.replace(APOSTROPHES, '')];
}

/** Normalized tokens with source ranges. */
export function matchTokens(text: string): MatchToken[] {
  const tokens: MatchToken[] = [];
  for (const match of text.matchAll(WORD)) {
    const start = match.index;
    const end = start + match[0].length;
    for (const word of expand(fold(match[0]))) {
      tokens.push({ text: word, start, end });
    }
    if (text.charAt(end) === PERCENT) {
      tokens.push({ text: 'percent', start, end: end + 1 });
    }
  }
  return tokens;
}

/** Just the normalized words. */
export function matchWords(text: string): string[] {
  return matchTokens(text).map((token) => token.text);
}
