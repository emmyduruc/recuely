import { QueryFailedError } from 'typeorm';

/** PostgreSQL SQLSTATE codes the app reacts to. */
export const PgErrorCode = {
  UniqueViolation: '23505',
  ForeignKeyViolation: '23503',
  CheckViolation: '23514',
} as const;
export type PgErrorCode = (typeof PgErrorCode)[keyof typeof PgErrorCode];

export function isPgError(error: unknown, code: PgErrorCode): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError: unknown = error.driverError;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === code
  );
}
