import { toApiError } from '../utils/api-error';
import { allowedMethods, fallbackError } from '../utils/api-fallback';
import { openApiDocument } from '../openapi/document';

const API_PREFIX = '/api/';

/**
 * A documented `/api` path called with another method gets a 405 `ApiError` with `Allow` (SPEC.md §B5.1).
 * Nitro would otherwise pass the request to the page renderer, which answers with its own error format.
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith(API_PREFIX)) return;
  const allow = allowedMethods(openApiDocument.paths, event.path);
  if (allow.length === 0 || allow.includes(event.method)) return;
  const { error } = fallbackError(openApiDocument.paths, event.method, event.path);
  const body = toApiError(error);
  setResponseHeader(event, 'allow', allow.join(', '));
  setResponseStatus(event, body.statusCode);
  return body;
});
