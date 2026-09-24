import { ApiErrorCode } from '@repo/contracts';
import { type DataSource, findLocalUser, type UserRow } from '@repo/db';
import { ApiException, HttpStatus } from './api-error';
import { useDataSource } from './database';

export interface LocalUserContext {
  ds: DataSource;
  user: UserRow;
}

/**
 * The connected DataSource plus the local user every `/api/me` route acts on.
 * R1 has exactly one local user (SPEC.md §B4); a missing one means the seed hasn't run.
 * Throws a 503 `ApiError` when the DB is unavailable, a 500 when the user is missing.
 */
export async function useLocalUser(): Promise<LocalUserContext> {
  const ds = await useDataSource();
  const user = await findLocalUser(ds);
  if (user === null) {
    throw new ApiException(
      HttpStatus.InternalServerError,
      ApiErrorCode.LocalUserMissing,
      'No local user exists. Run `pnpm db:seed`.',
    );
  }
  return { ds, user };
}
