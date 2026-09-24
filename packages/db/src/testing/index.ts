import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import {
  CONNECT_TIMEOUT_MS,
  createDataSource,
  type DatabaseConnection,
  type DatabaseEnv,
  driverUrl,
  readConnection,
  tlsOptions,
} from '../data-source.ts';
import { ALL_ENTITIES } from '../entities/index.ts';
import { DEFAULT_SCHEMA, qualifiedTable, quoteIdent } from '../sql.ts';

/** Integration-test database lifecycle (SPEC.md §C1.1). */
export const RUN_SCHEMA_PREFIX = 'it_';
export const STALE_RUN_SCHEMA_AGE_MS = 60 * 60 * 1000;

const RUN_SCHEMA_PATTERN = /^it_(\d{13})_[0-9a-f]{6}$/;
const NEON_POOLER_SUFFIX = '-pooler';
const SUPABASE_POOLER_DOMAIN = '.pooler.supabase.com';
const SUPABASE_DIRECT_HOST = /^db\.([a-z0-9]+)\.supabase\.co$/;

export class TestDatabaseConfigError extends Error {
  override name = 'TestDatabaseConfigError';
}

/** Loads the repo-root `.env` when present. Existing env vars win. */
export function loadRepoEnv(): void {
  const path = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

/** Neon's pooled host is `ep-x-pooler.…`, the direct one `ep-x.…`; both reach the same database. */
function canonicalHost(url: URL): string {
  const [first = '', ...rest] = url.hostname.toLowerCase().split('.');
  const endpoint = first.endsWith(NEON_POOLER_SUFFIX) ? first.slice(0, -NEON_POOLER_SUFFIX.length) : first;
  return [endpoint, ...rest].join('.');
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

/**
 * Supabase projects share the regional pooler host and are told apart by the user `postgres.<ref>`;
 * the direct host is `db.<ref>.supabase.co`. Ports 5432 (session) and 6543 (transaction) reach the same DB.
 */
function supabaseProjectRef(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host.endsWith(SUPABASE_POOLER_DOMAIN)) {
    const [, ref] = decodeURIComponent(url.username).split('.');
    return ref ?? null;
  }
  const direct = SUPABASE_DIRECT_HOST.exec(host);
  return direct?.[1] ?? null;
}

/** A string that is equal for two URLs exactly when they reach the same database. */
export function databaseIdentity(value: string): string {
  const url = new URL(value);
  const ref = supabaseProjectRef(url);
  if (ref !== null) {
    return `supabase:${ref}/${databaseName(url)}`;
  }
  return `${canonicalHost(url)}:${url.port || '5432'}/${databaseName(url)}`;
}

/** True when both URLs reach the same database (pooled or direct, any Supabase port). */
export function sameDatabase(a: string, b: string): boolean {
  return databaseIdentity(a) === databaseIdentity(b);
}

/** `DATABASE_URL_TEST` is required and must not be the dev database. Never falls back to `DATABASE_URL`. */
export function resolveTestDatabase(env: DatabaseEnv): DatabaseConnection {
  const testUrl = env.DATABASE_URL_TEST?.trim();
  if (testUrl === undefined || testUrl.length === 0) {
    throw new TestDatabaseConfigError(
      'DATABASE_URL_TEST is not set. Put the session-pooler connection string of your separate Supabase test ' +
        'project in the repo-root .env (see .env.example). Integration tests never fall back to DATABASE_URL.',
    );
  }
  const devUrl = env.DATABASE_URL?.trim();
  if (devUrl !== undefined && devUrl.length > 0 && sameDatabase(testUrl, devUrl)) {
    throw new TestDatabaseConfigError(
      'DATABASE_URL_TEST points at the same database as DATABASE_URL. Use a separate Supabase project for tests.',
    );
  }
  return readConnection(env, 'DATABASE_URL_TEST', '');
}

export function newRunSchemaName(now: number = Date.now(), random: string = randomBytes(3).toString('hex')): string {
  return `${RUN_SCHEMA_PREFIX}${String(now)}_${random}`;
}

/** Creation time encoded in a run-schema name, or null when the name isn't one. */
export function runSchemaCreatedAt(name: string): number | null {
  const match = RUN_SCHEMA_PATTERN.exec(name);
  return match?.[1] === undefined ? null : Number(match[1]);
}

export function isStaleRunSchema(name: string, now: number, maxAgeMs: number = STALE_RUN_SCHEMA_AGE_MS): boolean {
  const createdAt = runSchemaCreatedAt(name);
  return createdAt !== null && now - createdAt > maxAgeMs;
}

async function withAdminDataSource<T>(db: DatabaseConnection, action: (ds: DataSource) => Promise<T>): Promise<T> {
  const ds = new DataSource({
    type: 'postgres',
    url: driverUrl(db.url),
    schema: DEFAULT_SCHEMA,
    ssl: tlsOptions(db),
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    installExtensions: false,
    entities: [],
  });
  await ds.initialize();
  try {
    return await action(ds);
  } finally {
    await ds.destroy();
  }
}

/** Creates the run schema and applies every migration into it. Drops it again if migrating fails. */
export async function createRunSchema(db: DatabaseConnection, schema: string): Promise<void> {
  await withAdminDataSource(db, async (ds) => {
    await ds.query(`CREATE SCHEMA ${quoteIdent(schema)}`);
  });
  const ds = createDataSource({ ...db, schema });
  try {
    await ds.initialize();
    await ds.runMigrations({ transaction: 'each' });
  } catch (error) {
    await dropRunSchema(db, schema);
    throw error;
  } finally {
    if (ds.isInitialized) {
      await ds.destroy();
    }
  }
}

export async function dropRunSchema(db: DatabaseConnection, schema: string): Promise<void> {
  await withAdminDataSource(db, async (ds) => {
    await ds.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
  });
}

/** Drops `it_*` schemas left by crashed runs. Returns the names it dropped. */
export async function sweepStaleRunSchemas(db: DatabaseConnection, now: number = Date.now()): Promise<string[]> {
  return withAdminDataSource(db, async (ds) => {
    const rows: unknown = await ds.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'it\\_%'`,
    );
    const stale = schemaNames(rows).filter((name) => isStaleRunSchema(name, now));
    for (const name of stale) {
      await ds.query(`DROP SCHEMA IF EXISTS ${quoteIdent(name)} CASCADE`);
    }
    return stale;
  });
}

/** Names of all `it_*` schemas currently in the test database. */
export async function listRunSchemas(db: DatabaseConnection): Promise<string[]> {
  return withAdminDataSource(db, async (ds) => {
    const rows: unknown = await ds.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'it\\_%'`,
    );
    return schemaNames(rows);
  });
}

function schemaNames(rows: unknown): string[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((row: unknown) =>
    typeof row === 'object' && row !== null && 'schema_name' in row && typeof row.schema_name === 'string'
      ? [row.schema_name]
      : [],
  );
}

/** Empties every entity table in the DataSource's schema (between tests). */
export async function truncateAllTables(ds: DataSource, schema: string): Promise<void> {
  const tables = ALL_ENTITIES.map((entity) => {
    const tableName = entity.options.tableName;
    if (tableName === undefined) {
      throw new Error(`Entity ${entity.options.name} has no tableName`);
    }
    return qualifiedTable(schema, tableName);
  });
  await ds.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}
