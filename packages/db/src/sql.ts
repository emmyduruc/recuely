import type { QueryRunner } from 'typeorm';

export const DEFAULT_SCHEMA = 'public';

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export function isSafeIdentifier(name: string): boolean {
  return IDENTIFIER_PATTERN.test(name);
}

/** Double-quotes an identifier. Only lower-case snake_case names are accepted. */
export function quoteIdent(name: string): string {
  if (!isSafeIdentifier(name)) {
    throw new RangeError(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

/** `'a', 'b'` for a CHECK (... IN (...)) list built from a const object. */
export function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
}

/** The schema this DataSource writes to. Tests use a per-run schema (SPEC.md §C1.1). */
export function schemaOf(queryRunner: QueryRunner): string {
  const options = queryRunner.dataSource.options;
  return 'schema' in options && typeof options.schema === 'string' ? options.schema : DEFAULT_SCHEMA;
}

export function qualifiedTable(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}
