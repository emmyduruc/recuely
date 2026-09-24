import type { DataSource } from 'typeorm';
import { createDataSource, DatabaseConfigError, readDatabaseConfig } from '../data-source.ts';

/** Runs a CLI action against `DATABASE_URL`, printing config errors without a stack trace. */
export async function runWithDataSource(action: (ds: DataSource) => Promise<void>): Promise<void> {
  let ds: DataSource;
  try {
    ds = createDataSource(readDatabaseConfig(process.env));
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  await ds.initialize();
  try {
    await action(ds);
  } finally {
    await ds.destroy();
  }
}
