import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createDataSource } from '../../src/data-source.ts';
import { truncateAllTables } from '../../src/testing/index.ts';

/** A DataSource on this run's schema; every table is emptied before each test. */
export function useTestDataSource(): () => DataSource {
  let ds: DataSource | undefined;
  const schema = inject('testSchema');

  beforeAll(async () => {
    ds = createDataSource({ ...inject('testDatabase'), schema });
    await ds.initialize();
  });

  beforeEach(async () => {
    await truncateAllTables(current(), schema);
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
