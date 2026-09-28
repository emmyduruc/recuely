import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// SPEC.md §B3/Task 5: the engine imports nothing from Vue, Nuxt, DOM, Web Audio, TypeORM or AI SDKs, and it
// is deterministic: time is injected (`now`), so it never reads the clock, randomness or timers itself.
// (Lint enforces the import boundary too; tsconfig has no DOM lib, so DOM globals don't type-check.)

const SRC = new URL('../src/', import.meta.url);
const files = readdirSync(SRC).filter((file) => file.endsWith('.ts'));
const sources = files.map((file) => ({ file, text: readFileSync(new URL(file, SRC), 'utf8') }));

const IMPORT = /from\s+'([^']+)'/g;
const ALLOWED_IMPORT = /^(\.\/|@repo\/contracts$)/;
const IMPURE = /\b(Date\.now|new Date|Math\.random|setTimeout|setInterval|performance\.now|crypto\.|process\.|window\.|document\.|navigator\.)/;

describe('T5: the engine is pure', () => {
  it('T5: src/ imports only @repo/contracts and its own files', () => {
    const imports = sources.flatMap(({ file, text }) => Array.from(text.matchAll(IMPORT), (match) => ({ file, from: match[1] ?? '' })));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter(({ from }) => !ALLOWED_IMPORT.test(from))).toEqual([]);
  });

  it('T5: src/ never reads the clock, randomness, timers or browser/Node globals', () => {
    expect(sources.filter(({ text }) => IMPURE.test(text)).map(({ file }) => file)).toEqual([]);
  });
});
