import { fileURLToPath } from 'node:url';
import { HealthStatus } from '@repo/contracts';
import { describe, expect, inject, it } from 'vitest';
import { openApiDocument } from '../../server/openapi/document';
import type { OpenApiDocument } from '../../server/openapi/types';
import { checkCompleteness, scanRouteFiles, validateOpenApi31 } from '../support/openapi-completeness';
import { api } from './helpers';

describe('/api/health', () => {
  it('T1: reports the database as ok (and T10: both speech providers)', async () => {
    const health = await api('GET', '/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ app: HealthStatus.Ok, db: HealthStatus.Ok, speech: { local: HealthStatus.Ok } });
  });
});

describe('§B5.1 served documentation', () => {
  it('T1: /api/openapi.json is valid OpenAPI 3.1 and complete for every route file', async () => {
    const { status, body } = await api('GET', '/api/openapi.json');
    expect(status).toBe(200);
    expect(validateOpenApi31(body)).toEqual([]);
    expect(body).toEqual(JSON.parse(JSON.stringify(openApiDocument)));
    const { routes } = scanRouteFiles(fileURLToPath(new URL('../../server/api', import.meta.url)));
    expect(checkCompleteness(body as OpenApiDocument, routes)).toEqual([]);
  });

  it('T1: /api/docs serves Swagger UI pointing at the document', async () => {
    const response = await fetch(`${inject('baseUrl')}/api/docs`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('SwaggerUIBundle');
    expect(html).toContain('/api/openapi.json');
  });
});
