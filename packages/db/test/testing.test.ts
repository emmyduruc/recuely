import { describe, expect, it } from 'vitest';
import {
  isStaleRunSchema,
  newRunSchemaName,
  databaseIdentity,
  resolveTestDatabase,
  runSchemaCreatedAt,
  sameDatabase,
  STALE_RUN_SCHEMA_AGE_MS,
  TestDatabaseConfigError,
} from '../src/testing/index.ts';

const DEV = 'postgresql://app:pw@ep-dev-111.eu-central-1.aws.neon.tech/recuely?sslmode=require';
const DEV_POOLED = 'postgresql://app:pw@ep-dev-111-pooler.eu-central-1.aws.neon.tech/recuely?sslmode=require';
const TEST = 'postgresql://app:pw@ep-test-222.eu-central-1.aws.neon.tech/recuely?sslmode=require';

describe('§C1.1 test database guard', () => {
  it('T1: a missing DATABASE_URL_TEST fails (no silent skip, no fallback)', () => {
    expect(() => resolveTestDatabase({ DATABASE_URL: DEV })).toThrow(TestDatabaseConfigError);
    expect(() => resolveTestDatabase({ DATABASE_URL_TEST: ' ' })).toThrow(/DATABASE_URL_TEST is not set/);
  });

  it('T1: refuses a test URL that points at the dev database', () => {
    expect(() => resolveTestDatabase({ DATABASE_URL: DEV, DATABASE_URL_TEST: DEV })).toThrow(/same database/);
  });

  it('T1: treats the Neon pooled and direct hosts of one endpoint as the same database', () => {
    expect(sameDatabase(DEV, DEV_POOLED)).toBe(true);
    expect(() => resolveTestDatabase({ DATABASE_URL: DEV_POOLED, DATABASE_URL_TEST: DEV })).toThrow(
      TestDatabaseConfigError,
    );
  });

  it('T1: accepts a separate branch or a separate database on the same host', () => {
    expect(resolveTestDatabase({ DATABASE_URL: DEV, DATABASE_URL_TEST: TEST }).url).toBe(TEST);
    const otherDb = DEV.replace('/recuely?', '/recuely_test?');
    expect(sameDatabase(DEV, otherDb)).toBe(false);
  });
});

const SB_POOLER = 'aws-1-eu-west-1.pooler.supabase.com';
const SB_DEV_TX = `postgresql://postgres.devref123:pw@${SB_POOLER}:6543/postgres?pgbouncer=true`;
const SB_DEV_SESSION = `postgresql://postgres.devref123:pw@${SB_POOLER}:5432/postgres`;
const SB_DEV_DIRECT = 'postgresql://postgres:pw@db.devref123.supabase.co:5432/postgres';
const SB_TEST = `postgresql://postgres.testref456:pw@${SB_POOLER}:5432/postgres`;

describe('§C1.1 guard on Supabase', () => {
  it('T1: the transaction pooler, session pooler and direct host of one project are the same database', () => {
    expect(sameDatabase(SB_DEV_TX, SB_DEV_SESSION)).toBe(true);
    expect(sameDatabase(SB_DEV_TX, SB_DEV_DIRECT)).toBe(true);
    expect(databaseIdentity(SB_DEV_TX)).toBe('supabase:devref123/postgres');
    expect(() => resolveTestDatabase({ DATABASE_URL: SB_DEV_TX, DATABASE_URL_TEST: SB_DEV_SESSION })).toThrow(
      /same database/,
    );
  });

  it('T1: two projects behind the same regional pooler host are different databases', () => {
    expect(sameDatabase(SB_DEV_TX, SB_TEST)).toBe(false);
    expect(resolveTestDatabase({ DATABASE_URL: SB_DEV_TX, DATABASE_URL_TEST: SB_TEST }).url).toBe(SB_TEST);
  });
});

describe('run schema names', () => {
  it('T1: encode their creation time', () => {
    const name = newRunSchemaName(1_727_136_000_000, 'a1b2c3');
    expect(name).toBe('it_1727136000000_a1b2c3');
    expect(runSchemaCreatedAt(name)).toBe(1_727_136_000_000);
    expect(runSchemaCreatedAt('public')).toBeNull();
    expect(runSchemaCreatedAt('it_manual')).toBeNull();
  });

  it('T1: only run schemas older than one hour are stale', () => {
    const now = 1_727_136_000_000;
    expect(isStaleRunSchema(newRunSchemaName(now - STALE_RUN_SCHEMA_AGE_MS - 1, 'aaaaaa'), now)).toBe(true);
    expect(isStaleRunSchema(newRunSchemaName(now - 1000, 'aaaaaa'), now)).toBe(false);
    expect(isStaleRunSchema('public', now)).toBe(false);
  });
});
