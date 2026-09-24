import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  caCertKey,
  DatabaseConfigError,
  driverUrl,
  readCaCert,
  readDatabaseConfig,
  requiresTls,
  tlsOptions,
} from '../src/data-source.ts';
import { quoteIdent, sqlStringList } from '../src/sql.ts';

const NEON = 'postgresql://app:secret@ep-cool-name-123456.eu-central-1.aws.neon.tech/recuely?sslmode=require';

describe('readDatabaseConfig', () => {
  it('T1: reads DATABASE_URL and defaults the schema to public', () => {
    expect(readDatabaseConfig({ DATABASE_URL: NEON })).toEqual({ url: NEON, caCert: null, schema: 'public' });
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

describe('TLS', () => {
  it('T1: sslmode and pgbouncer are stripped so TLS is configured only in code', () => {
    const url = 'postgresql://u:p@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&application_name=x';
    expect(driverUrl(url)).toBe('postgresql://u:p@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?application_name=x');
  });

  it('T1: verification is always on; a configured CA is used', () => {
    expect(tlsOptions({ url: NEON, caCert: null })).toEqual({ rejectUnauthorized: true });
    expect(tlsOptions({ url: NEON, caCert: 'PEM' })).toEqual({ rejectUnauthorized: true, ca: 'PEM' });
    expect(tlsOptions({ url: 'postgres://u@localhost/db', caCert: 'PEM' })).toBe(false);
  });

  it('T1: a CA setting resolves relative to the repo root and must exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'ca-'));
    writeFileSync(join(root, 'ca.crt'), 'PEM');
    const key = caCertKey('DATABASE_URL_TEST');
    expect(key).toBe('DATABASE_URL_TEST_CA_CERT');
    expect(readCaCert({ [key]: 'ca.crt' }, key, root)).toBe('PEM');
    expect(readCaCert({}, key, root)).toBeNull();
    expect(() => readCaCert({ [key]: 'missing.crt' }, key, root)).toThrow(/does not exist/);
  });

  it('T1: each connection has its own CA, so a Supabase CA never affects the Neon connection', () => {
    const root = mkdtempSync(join(tmpdir(), 'ca-'));
    writeFileSync(join(root, 'supabase.crt'), 'SUPABASE-PEM');
    const env = { DATABASE_URL: NEON, DATABASE_URL_TEST_CA_CERT: join(root, 'supabase.crt') };
    expect(readDatabaseConfig(env).caCert).toBeNull();
  });

  it('T1: an unfilled placeholder URL is rejected with a hint', () => {
    expect(() => readDatabaseConfig({ DATABASE_URL: 'postgresql://postgres:[YOUR-PASSWORD]@db.x.supabase.co/postgres' })).toThrow(
      /placeholders/,
    );
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
