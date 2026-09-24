import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { HealthStatus } from '@repo/contracts';
import { createDataSource, seedLocalUser } from '@repo/db';
import {
  createRunSchema,
  dropRunSchema,
  loadRepoEnv,
  newRunSchemaName,
  resolveTestDatabaseUrl,
  sweepStaleRunSchemas,
} from '@repo/db/testing';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    testDatabaseUrl: string;
    testSchema: string;
  }
}

const SERVER_ENTRY = fileURLToPath(new URL('../../.output/server/index.mjs', import.meta.url));
const READY_TIMEOUT_MS = 60_000;

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
  const url = resolveTestDatabaseUrl(process.env);
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error('apps/web/.output is missing. Run `pnpm build` first (turbo does this for `pnpm test:int`).');
  }
  const schema = newRunSchemaName();
  await createRunSchema(url, schema);

  let server: ChildProcess | undefined;
  const teardown = async (): Promise<void> => {
    server?.kill();
    await dropRunSchema(url, schema);
    await sweepStaleRunSchemas(url);
  };

  try {
    const ds = createDataSource({ url, schema });
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
        DATABASE_URL: url,
        DB_SCHEMA: schema,
        API_DOCS_ENABLED: 'true',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await waitUntilReady(baseUrl, server);

    project.provide('baseUrl', baseUrl);
    project.provide('testDatabaseUrl', url);
    project.provide('testSchema', schema);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
