// Typed client for the web API (SPEC.md §B5). Components never show `ApiError.message`; they map the
// code to a translated message (§B11).
import {
  ApiErrorCode,
  type ChunkPlanResource,
  type CreateChunkPlanRequest,
  type CreateProjectRequest,
  type CreateScriptRequest,
  isValueOf,
  type Project,
  type Script,
} from '@repo/contracts';
import type { MessageKey } from './message-key';

export const api = {
  createProject: (body: CreateProjectRequest) => $fetch<Project>('/api/projects', { method: 'POST', body }),
  createScript: (projectId: string, body: CreateScriptRequest) =>
    $fetch<Script>(`/api/projects/${projectId}/scripts`, { method: 'POST', body }),
  createChunkPlan: (scriptId: string, body: CreateChunkPlanRequest) =>
    $fetch<ChunkPlanResource>(`/api/scripts/${scriptId}/chunk-plans`, { method: 'POST', body }),
};

export const API_ERROR_MESSAGE: Record<ApiErrorCode, MessageKey> = {
  [ApiErrorCode.ValidationFailed]: 'errors.validation_failed',
  [ApiErrorCode.NotFound]: 'errors.not_found',
  [ApiErrorCode.Conflict]: 'errors.conflict',
  [ApiErrorCode.LocalUserMissing]: 'errors.local_user_missing',
  [ApiErrorCode.DatabaseUnavailable]: 'errors.database_unavailable',
  [ApiErrorCode.Internal]: 'errors.internal_error',
  [ApiErrorCode.CoverageViolation]: 'errors.coverage_violation',
  [ApiErrorCode.ConfirmationRequired]: 'errors.confirmation_required',
  [ApiErrorCode.StaleUpdate]: 'errors.stale_update',
  [ApiErrorCode.PayloadTooLarge]: 'errors.payload_too_large',
  [ApiErrorCode.InsufficientStorage]: 'errors.insufficient_storage',
  [ApiErrorCode.UnsupportedMediaType]: 'errors.unsupported_media_type',
  [ApiErrorCode.RangeNotSatisfiable]: 'errors.range_not_satisfiable',
  [ApiErrorCode.SpeechUnavailable]: 'errors.speech_unavailable',
  [ApiErrorCode.MethodNotAllowed]: 'errors.method_not_allowed',
};

/** The translation key for a failed request: the API's error code, or a network error when there's no response. */
export function apiErrorMessage(error: unknown): MessageKey {
  if (typeof error !== 'object' || error === null || !('data' in error)) return 'errors.network';
  const { data } = error;
  const code = typeof data === 'object' && data !== null && 'code' in data ? data.code : undefined;
  return isValueOf(ApiErrorCode, code) ? API_ERROR_MESSAGE[code] : 'errors.network';
}
