import { CONTRACT_COMPONENTS } from './contract-schemas';
import { PATHS } from './paths';
import { RECORDING_PATHS } from './recording-paths';
import { SCHEMAS } from './schemas';
import { TAGS } from './tags';
import type { OpenApiDocument } from './types';

export const OPENAPI_JSON_ROUTE = '/api/openapi.json';
export const SWAGGER_UI_ROUTE = '/api/docs';

/** The web API's OpenAPI 3.1 document (SPEC.md §B5.1; hand-written because H-21 was refuted). */
export const openApiDocument: OpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Recording Companion API',
    description: 'Local API for the user, settings, projects, scripts, chunk plans, sessions, takes and exports.',
    version: '0.1.0',
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: TAGS,
  paths: { ...PATHS, ...RECORDING_PATHS },
  components: { schemas: { ...SCHEMAS, ...CONTRACT_COMPONENTS } },
};

const TRUE_VALUES = new Set(['true', '1']);

/** Docs are always on in dev; in production only when `API_DOCS_ENABLED=true` at runtime. */
export function apiDocsEnabled(isDev: boolean, env: Readonly<Partial<Record<string, string>>>): boolean {
  return isDev || TRUE_VALUES.has(env.API_DOCS_ENABLED?.trim().toLowerCase() ?? '');
}

const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0';

export function swaggerUiHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${openApiDocument.info.title}</title>
    <link rel="stylesheet" href="${SWAGGER_UI_CDN}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI_CDN}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({ url: ${JSON.stringify(OPENAPI_JSON_ROUTE)}, dom_id: '#swagger-ui', deepLinking: true });
      };
    </script>
  </body>
</html>
`;
}
