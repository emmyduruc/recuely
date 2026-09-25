import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { HealthStatus } from '@repo/contracts';
import { createDataSource, type DatabaseConnection, seedLocalUser } from '@repo/db';
import {
  createRunSchema,
  dropRunSchema,
  loadRepoEnv,
  newRunSchemaName,
  resolveTestDatabase,
  sweepStaleRunSchemas,
} from '@repo/db/testing';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    testDatabase: DatabaseConnection;
    testSchema: string;
    storageDir: string;
  }
}

const SERVER_ENTRY = fileURLToPath(new URL('../../.output/server/index.mjs', import.meta.url));
const READY_TIMEOUT_MS = 60_000;
/** Small, so the 413 path is testable without gigabytes. */
export const TEST_MAX_UPLOAD_BYTES = 1024 * 1024;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

async function waitUntilReady(baseUrl: string, server: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`The server exited early with code ${String(server.exitCode)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const health: unknown = await response.json();
      if (typeof health === 'object' && health !== null && 'db' in health && health.db === HealthStatus.Ok) {
        return;
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The server at ${baseUrl} did not report db: ok within ${String(READY_TIMEOUT_MS)} ms`);
}

/** SPEC.md §C1.1: per-run schema, seeded, served by the built app; dropped on teardown pass or fail. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  loadRepoEnv();
  const db = resolveTestDatabase(process.env);
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error('apps/web/.output is missing. Run `pnpm build` first (turbo does this for `pnpm test:int`).');
  }
  const schema = newRunSchemaName();
  const storageDir = mkdtempSync(join(tmpdir(), 'recuely-media-'));
  await createRunSchema(db, schema);

  let server: ChildProcess | undefined;
  const teardown = async (): Promise<void> => {
    server?.kill();
    // Test media only; the app itself never deletes media.
    rmSync(storageDir, { recursive: true, force: true });
    await dropRunSchema(db, schema);
    await sweepStaleRunSchemas(db);
  };

  try {
    const ds = createDataSource({ ...db, schema });
    await ds.initialize();
    await seedLocalUser(ds);
    await ds.destroy();

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${String(port)}`;
    server = spawn(process.execPath, [SERVER_ENTRY], {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
        DATABASE_URL: db.url,
        // The server reads the CA that belongs to DATABASE_URL; here that's the test project's.
        DATABASE_URL_CA_CERT: process.env.DATABASE_URL_TEST_CA_CERT ?? '',
        DB_SCHEMA: schema,
        API_DOCS_ENABLED: 'true',
        STORAGE_DIR: storageDir,
        MAX_UPLOAD_BYTES: String(TEST_MAX_UPLOAD_BYTES),
        MIN_FREE_BYTES: '1',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await waitUntilReady(baseUrl, server);

    project.provide('baseUrl', baseUrl);
    project.provide('testDatabase', db);
    project.provide('testSchema', schema);
    project.provide('storageDir', storageDir);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
