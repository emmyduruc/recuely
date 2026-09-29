import { ApiErrorCode } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { openApiDocument } from '../server/openapi/document';
import { allowedMethods, fallbackError } from '../server/utils/api-fallback';

describe('/api fallback (§B5.1: every error is an ApiError)', () => {
  it('T10: documented paths report their methods, with {params} matching one segment', () => {
    expect(allowedMethods(openApiDocument.paths, '/api/health')).toEqual(['GET']);
    expect(allowedMethods(openApiDocument.paths, '/api/takes/0192a1b2/media?x=1')).toEqual(['GET', 'PUT']);
    expect(allowedMethods(openApiDocument.paths, '/api/takes/a/b/media')).toEqual([]);
    expect(allowedMethods(openApiDocument.paths, '/api/nope')).toEqual([]);
  });

  it('T10: a wrong method is a 405 naming the allowed ones; an unknown path is a 404', () => {
    const wrong = fallbackError(openApiDocument.paths, 'DELETE', '/api/health');
    expect(wrong.allow).toEqual(['GET']);
    expect(wrong.error.statusCode).toBe(405);
    expect(wrong.error.code).toBe(ApiErrorCode.MethodNotAllowed);
    const unknown = fallbackError(openApiDocument.paths, 'GET', '/api/nope?a=1');
    expect(unknown.error.statusCode).toBe(404);
    expect(unknown.error.message).toBe('No API route GET /api/nope.');
  });
});
