import { ApiErrorCode, HealthStatus } from '@repo/contracts';
import { createDataSource, type DataSource, DatabaseConfigError, readDatabaseConfig } from '@repo/db';
import { ApiException, HttpStatus } from './api-error';

const HEALTH_TIMEOUT_MS = 1000;

let dataSource: DataSource | undefined;
let connecting: Promise<DataSource> | undefined;

function unavailable(message: string): ApiException {
  return new ApiException(HttpStatus.ServiceUnavailable, ApiErrorCode.DatabaseUnavailable, message);
}

async function connect(): Promise<DataSource> {
  let ds: DataSource;
  try {
    ds = createDataSource(readDatabaseConfig(process.env));
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      throw unavailable(error.message);
    }
    throw error;
  }
  try {
    await ds.initialize();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw unavailable(`The database is unreachable: ${reason}`);
  }
  dataSource = ds;
  return ds;
}

/** The shared DataSource, connected on first use. Throws a 503 `ApiError` when it can't connect. */
export async function useDataSource(): Promise<DataSource> {
  if (dataSource?.isInitialized === true) {
    return dataSource;
  }
  connecting ??= connect().finally(() => {
    connecting = undefined;
  });
  return connecting;
}

export async function closeDataSource(): Promise<void> {
  const ds = dataSource;
  dataSource = undefined;
  if (ds?.isInitialized === true) {
    await ds.destroy();
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`timed out after ${String(ms)} ms`));
    }, ms).unref();
  });
}

/** `ok` when `SELECT 1` answers within 1 s (SPEC.md §B7 health timeout), else `unavailable`. */
export async function databaseHealth(): Promise<HealthStatus> {
  try {
    await Promise.race([useDataSource().then((ds) => ds.query('SELECT 1')), timeout(HEALTH_TIMEOUT_MS)]);
    return HealthStatus.Ok;
  } catch {
    return HealthStatus.Unavailable;
  }
}
