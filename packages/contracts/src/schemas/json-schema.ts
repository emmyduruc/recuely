// A typed subset of JSON Schema 2020-12, plus `objectSchema<T>()`, which ties an object schema to a TS type:
// every property of T must be described, no extra ones may appear, and every required key of T must be in
// `required`. Drift between a type and its schema is a compile error.

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  title?: string;
  description?: string;
  type?: JsonType | readonly JsonType[];
  enum?: readonly (string | number | null)[];
  const?: string | number | boolean | null;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
  minProperties?: number;
  $defs?: Readonly<Record<string, JsonSchema>>;
}

/** Keys of T that are not optional. */
export type RequiredKeys<T> = Extract<{ [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T], string>;

export interface ObjectSchema<T, R extends readonly RequiredKeys<T>[] = readonly RequiredKeys<T>[]> extends JsonSchema {
  type: 'object';
  description: string;
  properties: { readonly [K in keyof T]-?: JsonSchema };
  required: R;
  /** `true` for messages (consumers ignore unknown fields, SPEC.md §B5); `false` for request bodies. */
  additionalProperties: boolean;
}

type MissingRequired<T, R extends readonly RequiredKeys<T>[]> = Exclude<RequiredKeys<T>, R[number]>;

/**
 * `objectSchema<WordTiming>()({ ... })`. The second call infers `required` as a tuple so a missing required key
 * shows up as a `missingRequiredKeys` error naming it.
 */
export function objectSchema<T>() {
  return <const R extends readonly RequiredKeys<T>[]>(
    schema: ObjectSchema<T, R> &
      ([MissingRequired<T, R>] extends [never] ? unknown : { missingRequiredKeys: MissingRequired<T, R> }),
  ): ObjectSchema<T, R> => schema;
}

export function nullable(schema: JsonSchema & { type: JsonType }): JsonSchema {
  return { ...schema, type: [schema.type, 'null'] };
}
