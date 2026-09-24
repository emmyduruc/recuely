import type { JsonSchema } from './json-schema.ts';

/** The exact bytes of each published schema file (2-space JSON + newline). */
export function schemaFileContents(schemas: Readonly<Record<string, JsonSchema>>): Record<string, string> {
  return Object.fromEntries(Object.entries(schemas).map(([type, schema]) => [type, `${JSON.stringify(schema, null, 2)}\n`]));
}
