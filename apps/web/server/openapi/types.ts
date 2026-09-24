// The subset of OpenAPI 3.1 this project uses. Typing the document catches most mistakes at compile time;
// the completeness test (SPEC.md §B5.1) and the official 3.1 JSON Schema catch the rest.

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export interface SchemaObject {
  $ref?: string;
  type?: JsonType | readonly JsonType[];
  description?: string;
  format?: 'uuid' | 'date-time' | 'email' | 'uri';
  enum?: readonly (string | null)[];
  properties?: Readonly<Record<string, SchemaObject>>;
  required?: readonly string[];
  additionalProperties?: boolean | SchemaObject;
  propertyNames?: SchemaObject;
  items?: SchemaObject;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  minProperties?: number;
  examples?: readonly unknown[];
}

export interface MediaTypeObject {
  schema: SchemaObject;
  example: unknown;
}

export interface ResponseObject {
  description: string;
  content?: Readonly<Record<'application/json', MediaTypeObject>>;
}

export interface ParameterObject {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description: string;
  schema: SchemaObject;
  example: unknown;
}

export interface RequestBodyObject {
  required: boolean;
  description: string;
  content: Readonly<Record<'application/json', MediaTypeObject>>;
}

export interface OperationObject {
  tags: readonly string[];
  operationId: string;
  summary: string;
  description: string;
  parameters?: readonly ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Readonly<Record<string, ResponseObject>>;
}

export const HttpMethod = {
  Get: 'get',
  Post: 'post',
  Put: 'put',
  Patch: 'patch',
  Delete: 'delete',
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

export type PathItemObject = Partial<Record<HttpMethod, OperationObject>>;

export interface TagObject {
  name: string;
  description: string;
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; description: string; version: string };
  servers: readonly { url: string; description: string }[];
  tags: readonly TagObject[];
  paths: Readonly<Record<string, PathItemObject>>;
  components: { schemas: Readonly<Record<string, SchemaObject>> };
}
