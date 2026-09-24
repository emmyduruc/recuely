import pg from 'pg';
import { DataSource } from 'typeorm';
import { ALL_MIGRATIONS } from '../migrations/index.ts';
import { ALL_ENTITIES } from './entities/index.ts';
import { DEFAULT_SCHEMA, isSafeIdentifier } from './sql.ts';

/** Neon may take several seconds to wake from scale-to-zero (SPEC.md §C1.1). */
export const CONNECT_TIMEOUT_MS = 15_000;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface DatabaseConfig {
  url: string;
  schema: string;
}

export type DatabaseEnv = Readonly<Partial<Record<string, string>>>;

export class DatabaseConfigError extends Error {
  override name = 'DatabaseConfigError';
}

/** Reads `DATABASE_URL` (and the test-only `DB_SCHEMA`). Throws a message that says how to fix it. */
export function readDatabaseConfig(env: DatabaseEnv): DatabaseConfig {
  const url = env.DATABASE_URL?.trim();
  if (url === undefined || url.length === 0) {
    throw new DatabaseConfigError(
      'DATABASE_URL is not set. Put your Neon connection string in the repo-root .env (see .env.example).',
    );
  }
  if (!isPostgresUrl(url)) {
    throw new DatabaseConfigError('DATABASE_URL must be a postgres:// or postgresql:// connection string.');
  }
  const schema = env.DB_SCHEMA?.trim() ?? DEFAULT_SCHEMA;
  if (!isSafeIdentifier(schema)) {
    throw new DatabaseConfigError(`DB_SCHEMA "${schema}" is not a valid lower-case schema name.`);
  }
  return { url, schema };
}

export function isPostgresUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return POSTGRES_PROTOCOLS.has(protocol);
  } catch {
    return false;
  }
}

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/** TLS is on for every non-local host (Neon requires it). A local server may still opt in via `sslmode`. */
export function requiresTls(url: string): boolean {
  return !LOCAL_HOSTS.has(new URL(url).hostname);
}

export function createDataSource(config: DatabaseConfig): DataSource {
  return new DataSource({
    type: 'postgres',
    driver: pg,
    url: config.url,
    schema: config.schema,
    ssl: requiresTls(config.url) ? { rejectUnauthorized: true } : false,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    applicationName: 'recuely',
    entities: ALL_ENTITIES,
    migrations: ALL_MIGRATIONS,
    migrationsTableName: 'migrations',
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    logging: false,
  });
}
