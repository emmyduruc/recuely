import { describe, expect, it } from 'vitest';
import { isCutPosition, normalize, snapToCut, spokenTextOf, stripEmphasis } from '../src/index.ts';

describe('text primitives', () => {
  it('T3: normalize is NFC + collapsed whitespace + trim (SPEC.md §B5 rule 3)', () => {
    expect(normalize('  Café \n\t time  ')).toBe('Café time');
  });

  it('T3: cut positions are whitespace-separated word starts, never inside a token like now—then', () => {
    const text = 'Hello there, now—then';
    expect(isCutPosition(text, 0)).toBe(true);
    expect(isCutPosition(text, 6)).toBe(true);
    expect(isCutPosition(text, 7)).toBe(false);
    expect(isCutPosition(text, 5)).toBe(false);
    expect(isCutPosition(text, text.indexOf('then'))).toBe(false);
  });

  it('T3: snapping moves to the nearest word start and never splits an emoji', () => {
    const text = 'hi 👋🏽 there';
    expect(snapToCut('hello world', 7, 12)).toBe(6);
    expect(snapToCut('hello world', 9, 12)).toBe(11 - 5);
    expect(snapToCut(text, 4, 12)).toBe(3);
    expect(snapToCut('abcdefghijklmnopqrstuvwxyz', 13, 3)).toBeNull();
  });

  it('T3: spoken text strips only the listed emphasis markers (SPEC.md §B5 rule 4)', () => {
    expect(stripEmphasis('a **bold** and __strong__ word')).toBe('a bold and strong word');
    expect(stripEmphasis('an *italic* and _em_ word')).toBe('an italic and em word');
    expect(stripEmphasis('keep snake_case_name, 2*3*4 and a**b**c')).toBe('keep snake_case_name, 2*3*4 and a**b**c');
    expect(stripEmphasis('a * lone star and _ lone underscore')).toBe('a * lone star and _ lone underscore');
    expect(spokenTextOf('  Say  **this**\n  now. ')).toBe('Say this now.');
  });
});
