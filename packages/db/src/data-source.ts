import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { ALL_MIGRATIONS } from '../migrations/index.ts';
import { ALL_ENTITIES } from './entities/index.ts';
import { DEFAULT_SCHEMA, isSafeIdentifier } from './sql.ts';

/** Hosted Postgres can take several seconds to accept a first connection (SPEC.md §C1.1). */
export const CONNECT_TIMEOUT_MS = 15_000;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
/** Dashboard templates like `[YOUR-PASSWORD]`. IPv6 hosts in brackets always contain `:`, so they don't match. */
const PLACEHOLDER = /\[[A-Za-z0-9_-]+\]/;
/** TLS is configured in code (below), and `pgbouncer` is a Prisma-only flag; neither may reach `pg`. */
const STRIPPED_URL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'pgbouncer'];

export interface DatabaseConnection {
  url: string;
  /** PEM of the CA that signs the server certificate (Supabase uses its own CA), or null for public CAs. */
  caCert: string | null;
}

export interface DatabaseConfig extends DatabaseConnection {
  schema: string;
}

export type DatabaseEnv = Readonly<Partial<Record<string, string>>>;

export class DatabaseConfigError extends Error {
  override name = 'DatabaseConfigError';
}

/** The monorepo root (where pnpm-workspace.yaml is), so relative paths in .env mean the same everywhere. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      return resolve(start);
    }
    dir = parent;
  }
  return dir;
}

/** Name of the optional CA setting that belongs to a URL setting, e.g. `DATABASE_URL_TEST_CA_CERT`. */
export function caCertKey(urlKey: string): string {
  return `${urlKey}_CA_CERT`;
}

/**
 * Reads the CA PEM for one connection (path relative to the repo root, or absolute).
 * Per connection, because a custom CA replaces the public bundle: Supabase needs its CA, Neon needs none.
 */
export function readCaCert(env: DatabaseEnv, key: string, repoRoot: string = findRepoRoot()): string | null {
  const configured = env[key]?.trim();
  if (configured === undefined || configured.length === 0) {
    return null;
  }
  const path = isAbsolute(configured) ? configured : join(repoRoot, configured);
  if (!existsSync(path)) {
    throw new DatabaseConfigError(`${key} points at ${path}, which does not exist.`);
  }
  return readFileSync(path, 'utf8');
}

export function isPostgresUrl(value: string): boolean {
  try {
    return POSTGRES_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Reads a connection URL from `env[key]`; throws a message that says how to fix it. */
export function readConnection(env: DatabaseEnv, key: string, missingHint: string): DatabaseConnection {
  const url = env[key]?.trim();
  if (url === undefined || url.length === 0) {
    throw new DatabaseConfigError(`${key} is not set. ${missingHint}`);
  }
  if (!isPostgresUrl(url) || PLACEHOLDER.test(url)) {
    throw new DatabaseConfigError(
      `${key} must be a postgres:// or postgresql:// connection string (check for unfilled placeholders).`,
    );
  }
  return { url, caCert: readCaCert(env, caCertKey(key)) };
}

/** Reads `DATABASE_URL`, `DATABASE_URL_CA_CERT` and the test-only `DB_SCHEMA`. */
export function readDatabaseConfig(env: DatabaseEnv): DatabaseConfig {
  const connection = readConnection(
    env,
    'DATABASE_URL',
    'Put your Neon connection string in the repo-root .env (see .env.example).',
  );
  const schema = env.DB_SCHEMA?.trim() ?? DEFAULT_SCHEMA;
  if (!isSafeIdentifier(schema)) {
    throw new DatabaseConfigError(`DB_SCHEMA "${schema}" is not a valid lower-case schema name.`);
  }
  return { ...connection, schema };
}

/** TLS is on for every non-local host. A local server may still opt in via its own config. */
export function requiresTls(url: string): boolean {
  return !LOCAL_HOSTS.has(new URL(url).hostname);
}

/** Removes URL parameters that would override the TLS settings below or that `pg` doesn't understand. */
export function driverUrl(url: string): string {
  const parsed = new URL(url);
  for (const param of STRIPPED_URL_PARAMS) {
    parsed.searchParams.delete(param);
  }
  return parsed.toString();
}

/** Verified TLS for remote hosts; the configured CA replaces the public bundle when set. */
export function tlsOptions(connection: DatabaseConnection): false | { rejectUnauthorized: true; ca?: string } {
  if (!requiresTls(connection.url)) {
    return false;
  }
  return connection.caCert === null ? { rejectUnauthorized: true } : { rejectUnauthorized: true, ca: connection.caCert };
}

export function createDataSource(config: DatabaseConfig): DataSource {
  return new DataSource({
    type: 'postgres',
    driver: pg,
    url: driverUrl(config.url),
    schema: config.schema,
    ssl: tlsOptions(config),
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    applicationName: 'recuely',
    entities: ALL_ENTITIES,
    migrations: ALL_MIGRATIONS,
    migrationsTableName: 'migrations',
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    // `seq` and `bytes` are bigint; values stay far below 2^53, so numbers are safe and simpler.
    parseInt8: true,
    logging: false,
  });
}
