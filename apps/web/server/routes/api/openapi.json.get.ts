import { apiDocsEnabled, openApiDocument } from '../../openapi/document';

export default defineEventHandler(() => {
  if (!apiDocsEnabled(import.meta.dev, process.env)) {
    throw createError({ statusCode: 404 });
  }
  return openApiDocument;
});
