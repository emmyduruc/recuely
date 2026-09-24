import { apiDocsEnabled, swaggerUiHtml } from '../../openapi/document';

export default defineEventHandler((event) => {
  if (!apiDocsEnabled(import.meta.dev, process.env)) {
    throw createError({ statusCode: 404 });
  }
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
  return swaggerUiHtml();
});
