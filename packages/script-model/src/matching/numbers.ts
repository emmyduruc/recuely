// Numbers → words, so "3 tools" (STT) and "three tools" (script) match (SPEC.md §B7 "normalize … numbers").

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES: [number, string][] = [
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1_000, 'thousand'],
];
/** Largest integer spelled out; bigger ones stay as digits. */
export const MAX_SPELLED = 999_999_999_999;

function belowThousand(n: number): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) {
    words.push(ONES[hundreds] ?? '', 'hundred');
  }
  if (rest >= 20) {
    words.push(TENS[Math.floor(rest / 10)] ?? '');
    if (rest % 10 > 0) {
      words.push(ONES[rest % 10] ?? '');
    }
  } else if (rest > 0 || hundreds === 0) {
    words.push(ONES[rest] ?? '');
  }
  return words;
}

/** 21 → ["twenty", "one"], 1005 → ["one", "thousand", "five"]. */
export function integerWords(n: number): string[] {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_SPELLED) {
    return [String(n)];
  }
  if (n < 1000) {
    return belowThousand(n);
  }
  const words: string[] = [];
  let rest = n;
  for (const [scale, name] of SCALES) {
    if (rest >= scale) {
      words.push(...belowThousand(Math.floor(rest / scale)), name);
      rest %= scale;
    }
  }
  if (rest > 0) {
    words.push(...belowThousand(rest));
  }
  return words;
}

const IRREGULAR_ORDINAL: Readonly<Record<string, string>> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};
const Y_SUFFIX = /y$/;

/** 1 → ["first"], 21 → ["twenty", "first"], 40 → ["fortieth"]. */
export function ordinalWords(n: number): string[] {
  const words = integerWords(n);
  const last = words.at(-1) ?? '';
  const ordinal = IRREGULAR_ORDINAL[last] ?? (Y_SUFFIX.test(last) ? last.replace(Y_SUFFIX, 'ieth') : `${last}th`);
  return [...words.slice(0, -1), ordinal];
}

const INTEGER = /^\d+$/;
const GROUPED = /^\d{1,3}(,\d{3})+$/;
const DECIMAL = /^(\d+)\.(\d+)$/;
const ORDINAL = /^(\d+)(st|nd|rd|th)$/;

/** Words for a numeric token ("3", "1,000", "3.5", "2nd"), or null if it isn't one. */
export function numberTokenWords(token: string): string[] | null {
  if (INTEGER.test(token)) {
    return integerWords(Number(token));
  }
  if (GROUPED.test(token)) {
    return integerWords(Number(token.replaceAll(',', '')));
  }
  const decimal = DECIMAL.exec(token);
  if (decimal !== null) {
    const [, whole = '0', fraction = ''] = decimal;
    return [...integerWords(Number(whole)), 'point', ...Array.from(fraction, (digit) => ONES[Number(digit)] ?? digit)];
  }
  const ordinal = ORDINAL.exec(token);
  if (ordinal !== null) {
    return ordinalWords(Number(ordinal[1]));
  }
  return null;
}
