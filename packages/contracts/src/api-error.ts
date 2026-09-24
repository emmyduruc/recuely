/** Stable machine codes for `ApiError.code` (SPEC.md §B5.1). */
export const ApiErrorCode = {
  ValidationFailed: 'validation_failed',
  NotFound: 'not_found',
  Conflict: 'conflict',
  LocalUserMissing: 'local_user_missing',
  DatabaseUnavailable: 'database_unavailable',
  Internal: 'internal_error',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

/** The body of every web API error response. */
export interface ApiError {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetail[];
}
