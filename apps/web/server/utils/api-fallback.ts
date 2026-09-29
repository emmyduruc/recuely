import { ApiErrorCode } from '@repo/contracts';
import { ApiException, HttpStatus, notFound } from './api-error';
import type { PathItemObject } from '../openapi/types';

// Unknown `/api` paths and methods get an `ApiError` too (SPEC.md §B5.1), never the page renderer's error.

/** `/api/takes/{id}/media` → a regex matching one concrete path (each `{param}` is one segment). */
function templatePattern(template: string): RegExp {
  const escaped = template
    .split(/\{[^}]+\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+');
  return new RegExp(`^${escaped}/?$`);
}

/** Methods documented for a concrete path, upper-case (empty when no documented path matches). */
export function allowedMethods(paths: Readonly<Record<string, PathItemObject>>, path: string): string[] {
  const pathname = path.split('?')[0] ?? path;
  const methods = Object.entries(paths)
    .filter(([template]) => templatePattern(template).test(pathname))
    .flatMap(([, item]) => Object.keys(item).map((method) => method.toUpperCase()));
  return [...new Set(methods)].sort();
}

/** 405 with the allowed methods when the path exists, else 404. */
export function fallbackError(paths: Readonly<Record<string, PathItemObject>>, method: string, path: string): { error: ApiException; allow: string[] } {
  const allow = allowedMethods(paths, path);
  if (allow.length === 0) {
    return { error: notFound(`No API route ${method} ${path.split('?')[0] ?? path}.`), allow };
  }
  return {
    error: new ApiException(HttpStatus.MethodNotAllowed, ApiErrorCode.MethodNotAllowed, `${method} is not supported here. Allowed: ${allow.join(', ')}.`),
    allow,
  };
}
