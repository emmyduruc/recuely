import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, contrastRatio, parseThemeTokens, ThemeBlock } from '../src/contrast.ts';

const tokens = parseThemeTokens(readFileSync(new URL('../app/assets/css/tokens.css', import.meta.url), 'utf8'));

describe('design token contrast (WCAG 2.2 AA)', () => {
  it('T11: both themes define the same color tokens', () => {
    expect([...tokens[ThemeBlock.Light].keys()].sort()).toEqual([...tokens[ThemeBlock.Dark].keys()].sort());
  });

  for (const theme of Object.values(ThemeBlock)) {
    it(`T11: every used token pair meets its minimum ratio (${theme})`, () => {
      const failures = CONTRAST_PAIRS.flatMap(({ fg, bg, min }) => {
        const ratio = contrastRatio(tokens[theme].get(fg) ?? '', tokens[theme].get(bg) ?? '');
        return ratio >= min ? [] : [`${fg} on ${bg}: ${ratio.toFixed(2)} < ${String(min)}`];
      });
      expect(failures).toEqual([]);
    });
  }

  it('T11: the ratio math matches known values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(() => contrastRatio('red', '#ffffff')).toThrow();
  });
});
