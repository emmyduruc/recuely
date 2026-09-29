import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { HttpMethod, JSON_MEDIA_TYPE, type OpenApiDocument, type SchemaObject } from '../../server/openapi/types';
import oasSchema from './oas-3.1-schema.json' with { type: 'json' };

// SPEC.md §B5.1 completeness checks. Returns human-readable violations; an empty list means compliant.

export interface RouteFile {
  path: string;
  method: HttpMethod;
}

const ERROR_STATUSES = new Set(['400', '404', '409', '413', '415', '416', '422', '500', '503', '507']);
const SUCCESS_STATUS = /^2\d\d$/;
const OPERATION_ID = /^[a-z][a-zA-Z0-9]*$/;
const SUMMARY_MAX = 60;
const ROUTE_FILE = /^(?<route>.+?)\.(?<method>get|post|put|patch|delete)\.ts$/;
const METHODS: readonly HttpMethod[] = Object.values(HttpMethod);
const INDEX_SEGMENT = 'index';
const API_ERROR_REF = '#/components/schemas/ApiError';
/** The method-agnostic fallback that answers unknown `/api` paths and methods with an `ApiError` (not a route). */
export const FALLBACK_ROUTE_FILE = '[...path].ts';

function isHttpMethod(value: string | undefined): value is HttpMethod {
  return METHODS.some((method) => method === value);
}

/** `me/voices/[id].delete.ts` → `{ path: '/api/me/voices/{id}', method: 'delete' }`. */
export function routeFromFile(file: string): RouteFile | null {
  const match = ROUTE_FILE.exec(file.split(sep).join('/'));
  const method = match?.groups?.method;
  const route = match?.groups?.route;
  if (route === undefined || !isHttpMethod(method)) {
    return null;
  }
  const segments = route
    .split('/')
    .filter((segment, index, all) => !(segment === INDEX_SEGMENT && index === all.length - 1))
    .map((segment) => segment.replace(/^\[(\w+)\]$/, '{$1}'));
  return { path: ['/api', ...segments].join('/'), method };
}

export function scanRouteFiles(apiDir: string): { routes: RouteFile[]; unrecognized: string[] } {
  const files = readdirSync(apiDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(apiDir, join(entry.parentPath, entry.name)));
  const routes: RouteFile[] = [];
  const unrecognized: string[] = [];
  for (const file of files.filter((name) => name !== FALLBACK_ROUTE_FILE)) {
    const route = routeFromFile(file);
    if (route === null) {
      unrecognized.push(file);
    } else {
      routes.push(route);
    }
  }
  return { routes, unrecognized };
}

function checkSchemaRefs(schema: SchemaObject, at: string, known: ReadonlySet<string>, out: string[]): void {
  if (schema.$ref !== undefined && !known.has(schema.$ref)) {
    out.push(`${at}: $ref ${schema.$ref} does not resolve`);
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    checkSchemaRefs(property, `${at}.${name}`, known, out);
  }
  if (schema.items !== undefined) {
    checkSchemaRefs(schema.items, `${at}[]`, known, out);
  }
  if (typeof schema.additionalProperties === 'object') {
    checkSchemaRefs(schema.additionalProperties, `${at}{}`, known, out);
  }
  (schema.anyOf ?? []).forEach((option, index) => {
    checkSchemaRefs(option, `${at}|${String(index)}`, known, out);
  });
}

function hasRefSchema(schema: SchemaObject): boolean {
  return schema.$ref !== undefined || schema.items?.$ref !== undefined;
}

/** Rules 1–8, route ↔ document mapping, unique operationIds and resolvable refs. */
export function checkCompleteness(doc: OpenApiDocument, routes: readonly RouteFile[]): string[] {
  const out: string[] = [];
  const registeredTags = new Set(doc.tags.map((tag) => tag.name));
  const schemaRefs = new Set(Object.keys(doc.components.schemas).map((name) => `#/components/schemas/${name}`));
  const operationIds = new Map<string, string>();
  const documented = new Set<string>();

  for (const tag of doc.tags) {
    if (tag.description.trim().length === 0) {
      out.push(`tag ${tag.name}: missing description`);
    }
  }

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (op === undefined) {
        continue;
      }
      const at = `${method.toUpperCase()} ${path}`;
      documented.add(`${method} ${path}`);

      if (op.tags.length !== 1 || !op.tags.every((tag) => registeredTags.has(tag))) {
        out.push(`${at}: must have exactly one registered tag (rule 1)`);
      }
      if (!OPERATION_ID.test(op.operationId)) {
        out.push(`${at}: operationId "${op.operationId}" must be camelCase (rule 2)`);
      }
      const clash = operationIds.get(op.operationId);
      if (clash !== undefined) {
        out.push(`${at}: operationId "${op.operationId}" is also used by ${clash}`);
      }
      operationIds.set(op.operationId, at);
      if (op.summary.trim().length === 0 || op.summary.length > SUMMARY_MAX) {
        out.push(`${at}: summary must be 1–${String(SUMMARY_MAX)} characters (rule 3)`);
      }
      if (op.description.trim().length === 0) {
        out.push(`${at}: missing description (rule 4)`);
      }
      const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      for (const name of pathParams) {
        if (!(op.parameters ?? []).some((param) => param.name === name)) {
          out.push(`${at}: path parameter {${String(name)}} is not documented (rule 5)`);
        }
      }
      for (const param of op.parameters ?? []) {
        if (param.description.trim().length === 0 || param.example === undefined) {
          out.push(`${at}: parameter ${param.name} needs a description and an example (rule 5)`);
        }
      }
      const jsonBody = op.requestBody?.content[JSON_MEDIA_TYPE];
      if (op.requestBody !== undefined) {
        const binary = Object.entries(op.requestBody.content).filter(([type]) => type !== JSON_MEDIA_TYPE);
        const jsonOk = jsonBody === undefined || (jsonBody.schema.$ref !== undefined && jsonBody.example !== undefined);
        const binaryOk = binary.every(([, media]) => (media.schema.description ?? '').trim().length > 0);
        if (!op.requestBody.required || !jsonOk || !binaryOk) {
          out.push(`${at}: requestBody needs required, a $ref schema and an example (rule 6)`);
        }
        if (jsonBody !== undefined) {
          checkSchemaRefs(jsonBody.schema, `${at} requestBody`, schemaRefs, out);
        }
      }
      const statuses = Object.keys(op.responses);
      if (!statuses.some((status) => SUCCESS_STATUS.test(status))) {
        out.push(`${at}: no success response (rule 7)`);
      }
      for (const [status, response] of Object.entries(op.responses)) {
        const media = response.content?.[JSON_MEDIA_TYPE];
        if (SUCCESS_STATUS.test(status) && media !== undefined && (!hasRefSchema(media.schema) || media.example === undefined)) {
          out.push(`${at} ${status}: success response needs a $ref schema and an example (rule 7)`);
        }
        const binary = Object.entries(response.content ?? {}).filter(([type]) => type !== JSON_MEDIA_TYPE);
        if (binary.some(([, body]) => (body.schema.description ?? '').trim().length === 0)) {
          out.push(`${at} ${status}: binary response schema needs a description (rule 7)`);
        }
        if (ERROR_STATUSES.has(status) && media?.schema.$ref !== API_ERROR_REF) {
          out.push(`${at} ${status}: error response must reference ApiError (rule 7)`);
        }
        if (media !== undefined) {
          checkSchemaRefs(media.schema, `${at} ${status}`, schemaRefs, out);
        }
      }
      if (jsonBody !== undefined && !statuses.includes('422')) {
        out.push(`${at}: an operation with a body must document 422 (rule 7)`);
      }
    }
  }

  for (const [name, schema] of Object.entries(doc.components.schemas)) {
    const at = `schema ${name}`;
    if ((schema.description ?? '').trim().length === 0) {
      out.push(`${at}: missing description (rule 8)`);
    }
    if ((schema.examples ?? []).length === 0) {
      out.push(`${at}: missing example (rule 8)`);
    }
    for (const [property, value] of Object.entries(schema.properties ?? {})) {
      if ((value.description ?? '').trim().length === 0) {
        out.push(`${at}.${property}: missing description (rule 8)`);
      }
    }
    checkSchemaRefs(schema, at, schemaRefs, out);
  }

  for (const route of routes) {
    if (!documented.has(`${route.method} ${route.path}`)) {
      out.push(`${route.method.toUpperCase()} ${route.path}: route file exists but is not documented`);
    }
  }
  for (const entry of documented) {
    if (!routes.some((route) => `${route.method} ${route.path}` === entry)) {
      out.push(`${entry}: documented but no route file handles it`);
    }
  }
  return out;
}

/**
 * Ajv mis-resolves the schema's `$dynamicRef: "#meta"`. In this (non-schema-validating) OAS schema the only
 * `$dynamicAnchor: meta` is `$defs/schema`, so a plain `$ref` to it is equivalent.
 */
function withStaticMetaRef(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(withStaticMetaRef);
  }
  if (typeof node !== 'object' || node === null) {
    return node;
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) =>
      key === DYNAMIC_REF_KEY ? ['$ref', META_DEF] : [key, withStaticMetaRef(value)],
    ),
  );
}

const DYNAMIC_REF_KEY = '$dynamicRef';
const META_DEF = '#/$defs/schema';

const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
const validateOas = ajv.compile(withStaticMetaRef(oasSchema) as object);

/** Validates against the official OpenAPI 3.1 JSON Schema (2022-10-07). */
export function validateOpenApi31(doc: unknown): string[] {
  if (validateOas(doc)) {
    return [];
  }
  return (validateOas.errors ?? []).map((err) => `OAS 3.1: ${err.instancePath || '/'} ${err.message ?? 'invalid'}`);
}
