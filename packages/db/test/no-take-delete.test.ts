import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// SPEC.md Task 4 done-when: "No code path hard-deletes a take (grep + test)". The DB trigger is the runtime
// guard (test/int/recording.int.test.ts); this scan keeps the code from even trying.

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
/** Application source. Test infrastructure (packages/db/src/testing) truncates whole test schemas. */
const ROOTS = ['packages/db/src', 'packages/db/migrations', 'packages/contracts/src', 'packages/script-model/src', 'apps/web/server'];
const EXCLUDED = ['packages/db/src/testing/'];

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: 'repository delete/remove on TakeEntity', pattern: /TakeEntity\)\s*\.\s*(delete|remove|softRemove|clear)\s*\(/ },
  { name: 'query-builder delete from TakeEntity', pattern: /\.delete\(\)\s*\.from\(\s*TakeEntity/ },
  { name: 'SQL DELETE FROM takes', pattern: /DELETE\s+FROM\s+[^;]*\btakes\b/i },
  { name: 'SQL TRUNCATE takes', pattern: /TRUNCATE\s+[^;]*\btakes\b/i },
  { name: 'cascade delete into takes', pattern: /takes[\s\S]{0,400}ON DELETE CASCADE/i },
  { name: 'storage delete', pattern: /\b(storage|instance)\s*\.\s*(delete|remove|unlink)\s*\(/ },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

/** Migration `down()` bodies drop tables on purpose; only `up()` counts. */
function withoutDownMigrations(source: string): string {
  return source.replace(/async down\([\s\S]*$/, '');
}

describe('T4: no code path hard-deletes a take', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(REPO, root))).filter(
    (file) => !EXCLUDED.some((excluded) => relative(REPO, file).startsWith(excluded)),
  );

  it('T4: the scan covers the app source', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((file) => file.endsWith('repositories/recording.ts'))).toBe(true);
  });

  for (const { name, pattern } of FORBIDDEN) {
    it(`T4: no ${name}`, () => {
      const hits = files.filter((file) => pattern.test(withoutDownMigrations(readFileSync(file, 'utf8'))));
      expect(hits.map((file) => relative(REPO, file))).toEqual([]);
    });
  }

  it('T4: the scan would catch an offender', () => {
    const offender = "await ds.getRepository(TakeEntity).delete({ id });\nawait ds.query('DELETE FROM takes');";
    expect(FORBIDDEN.filter(({ pattern }) => pattern.test(offender)).map(({ name }) => name)).toEqual([
      'repository delete/remove on TakeEntity',
      'SQL DELETE FROM takes',
    ]);
  });
});
