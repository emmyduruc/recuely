import type { TestProject } from 'vitest/node';
import type { DatabaseConnection } from '../../src/data-source.ts';
import {
  createRunSchema,
  dropRunSchema,
  loadRepoEnv,
  newRunSchemaName,
  resolveTestDatabase,
  sweepStaleRunSchemas,
} from '../../src/testing/index.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabase: DatabaseConnection;
    testSchema: string;
  }
}

/** SPEC.md §C1.1: fresh `it_*` schema per run, dropped on teardown whether tests pass or fail. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  loadRepoEnv();
  const db = resolveTestDatabase(process.env);
  const schema = newRunSchemaName();
  await createRunSchema(db, schema);
  project.provide('testDatabase', db);
  project.provide('testSchema', schema);

  return async () => {
    await dropRunSchema(db, schema);
    const swept = await sweepStaleRunSchemas(db);
    if (swept.length > 0) {
      console.log(`Swept stale test schemas: ${swept.join(', ')}`);
    }
  };
}
