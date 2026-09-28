// §B9: no raw hex colors outside tokens.css, across the UI package and the web app.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = new URL('../../../', import.meta.url).pathname;
const ROOTS = ['packages/ui/app', 'packages/ui/src', 'apps/web/app'];
const ALLOWED = new Set(['packages/ui/app/assets/css/tokens.css']);
const EXTENSIONS = /\.(vue|css|ts)$/;
const RAW_HEX = /#[0-9a-f]{3,8}\b/gi;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

export function findRawHex(source: string): string[] {
  return [...source.matchAll(RAW_HEX)].map((m) => m[0]);
}

describe('raw hex colors', () => {
  it('T11: none outside tokens.css', () => {
    const offenders = ROOTS.flatMap((root) => files(join(REPO, root)))
      .map((path) => relative(REPO, path))
      .filter((path) => !ALLOWED.has(path))
      .flatMap((path) => findRawHex(readFileSync(join(REPO, path), 'utf8')).map((hex) => `${path}: ${hex}`));
    expect(offenders).toEqual([]);
  });

  it('T11: the check catches a deliberate bad sample', () => {
    expect(findRawHex('<div style="color: #ff0000">')).toEqual(['#ff0000']);
    expect(findRawHex('.a { color: var(--rc-live); }')).toEqual([]);
  });
});
