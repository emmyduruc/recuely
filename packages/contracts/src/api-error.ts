/** Stable machine codes for `ApiError.code` (SPEC.md §B5.1). */
export const ApiErrorCode = {
  ValidationFailed: 'validation_failed',
  NotFound: 'not_found',
  Conflict: 'conflict',
  LocalUserMissing: 'local_user_missing',
  DatabaseUnavailable: 'database_unavailable',
  Internal: 'internal_error',
  /** A chunk plan or script would not preserve the spoken text (SPEC.md §B5 rules 2–4). */
  CoverageViolation: 'coverage_violation',
  /** A destructive action was sent without `confirm=true`. */
  ConfirmationRequired: 'confirmation_required',
  /** A session autosave carried a `seq` not greater than the stored one. */
  StaleUpdate: 'stale_update',
  PayloadTooLarge: 'payload_too_large',
  InsufficientStorage: 'insufficient_storage',
  UnsupportedMediaType: 'unsupported_media_type',
  RangeNotSatisfiable: 'range_not_satisfiable',
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
