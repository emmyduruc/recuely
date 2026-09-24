import { describe, expect, it } from 'vitest';
import { readJson } from './fixtures.ts';

interface Utf16Fixture {
  text: string;
  utf16Length: number;
  codePointLength: number;
  spans: { label: string; start: number; end: number; text: string }[];
}

const fixture = readJson('text/utf16-offsets.json') as Utf16Fixture;

describe('T2: UTF-16 offset fixture (SPEC.md §B5 rule 1)', () => {
  it('T2: JS string length is the UTF-16 length, not the code-point count', () => {
    expect(fixture.text.length).toBe(fixture.utf16Length);
    // Code points on purpose: the fixture proves they differ from UTF-16 units.
    expect(Array.from(fixture.text).length).toBe(fixture.codePointLength);
    expect(fixture.utf16Length).toBeGreaterThan(fixture.codePointLength);
  });

  it('T2: the text is deliberately not NFC-normalized', () => {
    expect(fixture.text.normalize('NFC')).not.toBe(fixture.text);
  });

  for (const span of fixture.spans) {
    it(`T2: offsets select "${span.label}"`, () => {
      expect(fixture.text.slice(span.start, span.end)).toBe(span.text);
    });
  }
});
