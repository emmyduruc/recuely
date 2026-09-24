import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apiDocsEnabled, openApiDocument } from '../server/openapi/document';
import { ApiTag } from '../server/openapi/tags';
import type { OpenApiDocument, OperationObject } from '../server/openapi/types';
import { checkCompleteness, routeFromFile, scanRouteFiles, validateOpenApi31 } from './support/openapi-completeness';

const apiDir = fileURLToPath(new URL('../server/api', import.meta.url));
const { routes, unrecognized } = scanRouteFiles(apiDir);

function withOperation(path: string, operation: OperationObject): OpenApiDocument {
  return { ...openApiDocument, paths: { ...openApiDocument.paths, [path]: { get: operation } } };
}

const sampleOperation: OperationObject = {
  tags: [ApiTag.Health],
  operationId: 'getSample',
  summary: 'Get a sample',
  description: 'A sample operation.',
  responses: { 200: { description: 'OK' } },
};

describe('§B5.1 OpenAPI completeness', () => {
  it('T1: every route file is recognized', () => {
    expect(unrecognized).toEqual([]);
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });

  it('T1: the web API document meets rules 1–8 and matches the route files', () => {
    expect(checkCompleteness(openApiDocument, routes)).toEqual([]);
  });

  it('T1: the document validates as OpenAPI 3.1', () => {
    expect(validateOpenApi31(JSON.parse(JSON.stringify(openApiDocument)))).toEqual([]);
  });

  it('T1: every tag in the §B5.1 registry is registered with a description', () => {
    expect(openApiDocument.tags.map((tag) => tag.name)).toEqual(Object.values(ApiTag));
  });

  it('T1: fails on an undocumented route file', () => {
    const extra = [...routes, { path: '/api/me/secret', method: 'get' as const }];
    expect(checkCompleteness(openApiDocument, extra)).toContain(
      'GET /api/me/secret: route file exists but is not documented',
    );
  });

  it('T1: fails on an operation without a tag or with an unregistered one', () => {
    const untagged = withOperation('/api/sample', { ...sampleOperation, tags: [] });
    const unknown = withOperation('/api/sample', { ...sampleOperation, tags: ['Nope'] });
    const sampleRoutes = [...routes, { path: '/api/sample', method: 'get' as const }];
    expect(checkCompleteness(untagged, sampleRoutes)).toContain(
      'GET /api/sample: must have exactly one registered tag (rule 1)',
    );
    expect(checkCompleteness(unknown, sampleRoutes)).toContain(
      'GET /api/sample: must have exactly one registered tag (rule 1)',
    );
  });

  it('T1: fails on a documented path without a handler, a long summary, and a bad operationId', () => {
    const doc = withOperation('/api/ghost', {
      ...sampleOperation,
      operationId: 'Get_Ghost',
      summary: 'x'.repeat(61),
    });
    const violations = checkCompleteness(doc, routes);
    expect(violations).toContain('get /api/ghost: documented but no route file handles it');
    expect(violations).toContain('GET /api/ghost: summary must be 1–60 characters (rule 3)');
    expect(violations).toContain('GET /api/ghost: operationId "Get_Ghost" must be camelCase (rule 2)');
  });

  it('T1: fails on an error response that does not reference ApiError, and on a dangling $ref', () => {
    const doc = withOperation('/api/sample', {
      ...sampleOperation,
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Nope' }, example: {} } } },
        500: { description: 'Boom' },
      },
    });
    const violations = checkCompleteness(doc, [...routes, { path: '/api/sample', method: 'get' }]);
    expect(violations).toContain('GET /api/sample 500: error response must reference ApiError (rule 7)');
    expect(violations).toContain('GET /api/sample 200: $ref #/components/schemas/Nope does not resolve');
  });

  it('T1: fails on a schema property without a description', () => {
    const doc: OpenApiDocument = {
      ...openApiDocument,
      components: {
        schemas: {
          ...openApiDocument.components.schemas,
          Bare: { type: 'object', description: 'x', examples: [{}], properties: { a: { type: 'string' } } },
        },
      },
    };
    expect(checkCompleteness(doc, routes)).toContain('schema Bare.a: missing description (rule 8)');
  });

  it('T1: rejects a document that is not OpenAPI 3.1', () => {
    expect(validateOpenApi31({ openapi: '3.0.0', info: {} })).not.toEqual([]);
  });
});

describe('route file mapping', () => {
  it('T1: maps Nitro file names to OpenAPI paths', () => {
    expect(routeFromFile('health.get.ts')).toEqual({ path: '/api/health', method: 'get' });
    expect(routeFromFile('me/voices/index.post.ts')).toEqual({ path: '/api/me/voices', method: 'post' });
    expect(routeFromFile('me/voices/[id].delete.ts')).toEqual({ path: '/api/me/voices/{id}', method: 'delete' });
    expect(routeFromFile('me/helper.ts')).toBeNull();
  });
});

describe('docs gate', () => {
  it('T1: docs are on in dev and off in production unless API_DOCS_ENABLED=true at runtime', () => {
    expect(apiDocsEnabled(true, {})).toBe(true);
    expect(apiDocsEnabled(false, {})).toBe(false);
    expect(apiDocsEnabled(false, { API_DOCS_ENABLED: 'false' })).toBe(false);
    expect(apiDocsEnabled(false, { API_DOCS_ENABLED: 'true' })).toBe(true);
  });
});
