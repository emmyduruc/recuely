import { createDataSource, type DataSource, seedLocalUser } from '@repo/db';
import { truncateAllTables } from '@repo/db/testing';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';

export interface JsonResponse {
  status: number;
  body: unknown;
}

/** Calls the server under test. */
export async function api(method: string, path: string, body?: unknown): Promise<JsonResponse> {
  const response = await fetch(`${inject('baseUrl')}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? null : (JSON.parse(text) as unknown) };
}

/** Before each test: empty every table and re-seed the local user, so tests don't depend on each other. */
export function useSeededDatabase(): () => DataSource {
  let ds: DataSource | undefined;
  const schema = inject('testSchema');

  beforeAll(async () => {
    ds = createDataSource({ ...inject('testDatabase'), schema });
    await ds.initialize();
  });

  beforeEach(async () => {
    await truncateAllTables(current(), schema);
    await seedLocalUser(current());
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  function current(): DataSource {
    if (ds === undefined) {
      throw new Error('Test DataSource used before beforeAll ran');
    }
    return ds;
  }

  return current;
}
