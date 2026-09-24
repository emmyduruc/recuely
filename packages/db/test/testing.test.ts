import { describe, expect, it } from 'vitest';
import {
  isStaleRunSchema,
  newRunSchemaName,
  resolveTestDatabaseUrl,
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
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL: DEV })).toThrow(TestDatabaseConfigError);
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL_TEST: ' ' })).toThrow(/DATABASE_URL_TEST is not set/);
  });

  it('T1: refuses a test URL that points at the dev database', () => {
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL: DEV, DATABASE_URL_TEST: DEV })).toThrow(/same database/);
  });

  it('T1: treats the Neon pooled and direct hosts of one endpoint as the same database', () => {
    expect(sameDatabase(DEV, DEV_POOLED)).toBe(true);
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL: DEV_POOLED, DATABASE_URL_TEST: DEV })).toThrow(
      TestDatabaseConfigError,
    );
  });

  it('T1: accepts a separate branch or a separate database on the same host', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL: DEV, DATABASE_URL_TEST: TEST })).toBe(TEST);
    const otherDb = DEV.replace('/recuely?', '/recuely_test?');
    expect(sameDatabase(DEV, otherDb)).toBe(false);
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
