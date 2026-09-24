import type { TestProject } from 'vitest/node';
import {
  createRunSchema,
  dropRunSchema,
  loadRepoEnv,
  newRunSchemaName,
  resolveTestDatabaseUrl,
  sweepStaleRunSchemas,
} from '../../src/testing/index.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
    testSchema: string;
  }
}

/** SPEC.md §C1.1: fresh `it_*` schema per run, dropped on teardown whether tests pass or fail. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  loadRepoEnv();
  const url = resolveTestDatabaseUrl(process.env);
  const schema = newRunSchemaName();
  await createRunSchema(url, schema);
  project.provide('testDatabaseUrl', url);
  project.provide('testSchema', schema);

  return async () => {
    await dropRunSchema(url, schema);
    const swept = await sweepStaleRunSchemas(url);
    if (swept.length > 0) {
      console.log(`Swept stale test schemas: ${swept.join(', ')}`);
    }
  };
}
