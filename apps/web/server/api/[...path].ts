import { openApiDocument } from '../openapi/document';
import { defineApiHandler } from '../utils/api-handler';
import { fallbackError } from '../utils/api-fallback';

/**
 * Fallback for every `/api` request no route handles: an `ApiError` 404, or 405 with `Allow` when the path
 * exists with other methods. Without it, the page renderer answered with its own error JSON (and a stack in dev).
 */
export default defineApiHandler((event) => {
  const { error, allow } = fallbackError(openApiDocument.paths, event.method, event.path);
  if (allow.length > 0) setResponseHeader(event, 'allow', allow.join(', '));
  return Promise.reject(error);
});
