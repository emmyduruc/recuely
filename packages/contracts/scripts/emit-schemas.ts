import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEMAS } from '../src/schemas/index.ts';
import { schemaFileContents } from '../src/schemas/files.ts';

// Writes packages/contracts/schemas/<Type>.json. A test fails when these are stale, so run this after
// changing a schema: `pnpm --filter @repo/contracts schemas:emit`.
const dir = fileURLToPath(new URL('../schemas/', import.meta.url));
mkdirSync(dir, { recursive: true });
for (const [type, contents] of Object.entries(schemaFileContents(SCHEMAS))) {
  writeFileSync(`${dir}${type}.json`, contents);
}
console.log(`Wrote ${String(Object.keys(SCHEMAS).length)} schemas to ${dir}`);
