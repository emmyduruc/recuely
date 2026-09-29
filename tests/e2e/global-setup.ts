// E2E against the built app with a real database (SPEC.md §C1.1): a per-run schema on DATABASE_URL_TEST,
// migrated and seeded, served on a fixed port; the schema and test media are removed on teardown.
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HealthStatus } from '@repo/contracts';
import { createDataSource, seedLocalUser } from '@repo/db';
import {
  createRunSchema,
  dropRunSchema,
  loadRepoEnv,
  newRunSchemaName,
  resolveTestDatabase,
  sweepStaleRunSchemas,
} from '@repo/db/testing';

export const E2E_PORT = 3100;
const SERVER_ENTRY = fileURLToPath(new URL('../../apps/web/.output/server/index.mjs', import.meta.url));
const READY_TIMEOUT_MS = 60_000;

async function waitUntilReady(baseUrl: string, server: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`The server exited early with code ${String(server.exitCode)}`);
    try {
      const health: unknown = await (await fetch(`${baseUrl}/api/health`)).json();
      if (typeof health === 'object' && health !== null && 'db' in health && health.db === HealthStatus.Ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The server at ${baseUrl} did not report db: ok within ${String(READY_TIMEOUT_MS)} ms`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  loadRepoEnv();
  const db = resolveTestDatabase(process.env);
  if (!existsSync(SERVER_ENTRY)) throw new Error('apps/web/.output is missing. Run `pnpm build` first.');
  const schema = newRunSchemaName();
  const storageDir = mkdtempSync(join(tmpdir(), 'recuely-e2e-media-'));
  await createRunSchema(db, schema);

  let server: ChildProcess | undefined;
  const teardown = async (): Promise<void> => {
    server?.kill();
    rmSync(storageDir, { recursive: true, force: true });
    await dropRunSchema(db, schema);
    await sweepStaleRunSchemas(db);
  };

  try {
    const ds = createDataSource({ ...db, schema });
    await ds.initialize();
    await seedLocalUser(ds);
    await ds.destroy();

    server = spawn(process.execPath, [SERVER_ENTRY], {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(E2E_PORT),
        DATABASE_URL: db.url,
        DATABASE_URL_CA_CERT: process.env.DATABASE_URL_TEST_CA_CERT ?? '',
        DB_SCHEMA: schema,
        STORAGE_DIR: storageDir,
        NUXT_PUBLIC_DESIGN_PAGE_ENABLED: 'true',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await waitUntilReady(`http://127.0.0.1:${String(E2E_PORT)}`, server);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
