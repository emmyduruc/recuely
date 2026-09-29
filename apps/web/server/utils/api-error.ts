import { type ApiError, ApiErrorCode, type ApiErrorDetail } from '@repo/contracts';

/** Thrown inside route handlers; `defineApiHandler` turns it into an `ApiError` response (SPEC.md §B5.1). */
export class ApiException extends Error {
  override name = 'ApiException';
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetail[] | undefined;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const HttpStatus = {
  Ok: 200,
  Created: 201,
  NoContent: 204,
  PartialContent: 206,
  BadRequest: 400,
  NotFound: 404,
  MethodNotAllowed: 405,
  Conflict: 409,
  PayloadTooLarge: 413,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  UnprocessableEntity: 422,
  InternalServerError: 500,
  ServiceUnavailable: 503,
  InsufficientStorage: 507,
} as const;

export function unprocessable(code: ApiErrorCode, message: string, details?: ApiErrorDetail[]): ApiException {
  return new ApiException(HttpStatus.UnprocessableEntity, code, message, details);
}

export function validationFailed(details: ApiErrorDetail[]): ApiException {
  return new ApiException(
    HttpStatus.UnprocessableEntity,
    ApiErrorCode.ValidationFailed,
    'The request body is invalid.',
    details,
  );
}

export function notFound(message: string): ApiException {
  return new ApiException(HttpStatus.NotFound, ApiErrorCode.NotFound, message);
}

export function conflict(message: string): ApiException {
  return new ApiException(HttpStatus.Conflict, ApiErrorCode.Conflict, message);
}

/** Every error leaving a route has the `ApiError` shape; unknown errors never leak internals. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiException) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  return {
    statusCode: HttpStatus.InternalServerError,
    code: ApiErrorCode.Internal,
    message: 'Something went wrong on the server.',
  };
}
