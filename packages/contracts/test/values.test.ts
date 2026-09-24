import { describe, expect, it } from 'vitest';
import { isValueOf, Locale, Theme } from '../src/index.ts';

describe('isValueOf', () => {
  it('T1: accepts members of a const object', () => {
    expect(isValueOf(Locale, Locale.En)).toBe(true);
    expect(isValueOf(Theme, Theme.Light)).toBe(true);
  });

  it('T1: rejects non-members and non-strings', () => {
    expect(isValueOf(Locale, 'de')).toBe(false);
    expect(isValueOf(Theme, 'neon')).toBe(false);
    expect(isValueOf(Theme, 1)).toBe(false);
    expect(isValueOf(Theme, null)).toBe(false);
  });
});
