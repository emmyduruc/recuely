import { describe, expect, it } from 'vitest';
import { DatabaseConfigError, readDatabaseConfig, requiresTls } from '../src/data-source.ts';
import { quoteIdent, sqlStringList } from '../src/sql.ts';

const NEON = 'postgresql://app:secret@ep-cool-name-123456.eu-central-1.aws.neon.tech/recuely?sslmode=require';

describe('readDatabaseConfig', () => {
  it('T1: reads DATABASE_URL and defaults the schema to public', () => {
    expect(readDatabaseConfig({ DATABASE_URL: NEON })).toEqual({ url: NEON, schema: 'public' });
  });

  it('T1: a missing DATABASE_URL gives a clear error', () => {
    expect(() => readDatabaseConfig({})).toThrow(DatabaseConfigError);
    expect(() => readDatabaseConfig({ DATABASE_URL: '  ' })).toThrow(/DATABASE_URL is not set/);
  });

  it('T1: rejects a non-postgres URL and an unsafe DB_SCHEMA', () => {
    expect(() => readDatabaseConfig({ DATABASE_URL: 'mysql://x@y/z' })).toThrow(/postgres/);
    expect(() => readDatabaseConfig({ DATABASE_URL: NEON, DB_SCHEMA: 'x"; DROP' })).toThrow(/DB_SCHEMA/);
  });
});

describe('requiresTls', () => {
  it('T1: TLS for Neon and any remote host, not for localhost', () => {
    expect(requiresTls(NEON)).toBe(true);
    expect(requiresTls('postgres://u@localhost:5432/db')).toBe(false);
    expect(requiresTls('postgres://u@127.0.0.1/db')).toBe(false);
  });
});

describe('sql helpers', () => {
  it('T1: quoteIdent only accepts snake_case identifiers', () => {
    expect(quoteIdent('it_1_abc')).toBe('"it_1_abc"');
    expect(() => quoteIdent('Users')).toThrow(RangeError);
    expect(() => quoteIdent('a"b')).toThrow(RangeError);
  });

  it('T1: sqlStringList escapes quotes', () => {
    expect(sqlStringList(['en', "o'x"])).toBe("'en', 'o''x'");
  });
});
