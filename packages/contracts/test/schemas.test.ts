import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { CONTRACT_VERSION } from '../src/index.ts';
import { schemaFileContents } from '../src/schemas/files.ts';
import { type JsonSchema, SCHEMAS } from '../src/schemas/index.ts';

const schemaDir = new URL('../schemas/', import.meta.url);

function undescribed(schema: JsonSchema, at: string): string[] {
  return Object.entries(schema.properties ?? {}).flatMap(([name, property]) => [
    ...((property.description ?? '').length === 0 ? [`${at}.${name}`] : []),
    ...undescribed(property, `${at}.${name}`),
  ]);
}

describe('published schemas', () => {
  it('T2: schemas/*.json are up to date (run `pnpm --filter @repo/contracts schemas:emit`)', () => {
    for (const [type, contents] of Object.entries(schemaFileContents(SCHEMAS))) {
      expect(readFileSync(new URL(`${type}.json`, schemaDir), 'utf8'), type).toBe(contents);
    }
  });

  it('T2: every schema and every property is described', () => {
    for (const [type, schema] of Object.entries(SCHEMAS)) {
      expect(schema.description, type).toBeTruthy();
      expect(undescribed(schema, type)).toEqual([]);
    }
  });

  it('T2: contract version 0.1.0 is exported and matches the package version', () => {
    expect(CONTRACT_VERSION).toBe('0.1.0');
    expect(pkg.version).toBe(CONTRACT_VERSION);
  });
});
