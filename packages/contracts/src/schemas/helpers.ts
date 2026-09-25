import type { JsonSchema } from './json-schema.ts';

/** `$ref` to another published contract schema (`<Type>.json`). */
export const ref = (type: string): JsonSchema => ({ $ref: `${type}.json` });

export const nonNegativeInt = (description: string): JsonSchema => ({ type: 'integer', minimum: 0, description });

export const unit = (description: string): JsonSchema => ({ type: 'number', minimum: 0, maximum: 1, description });

/** Non-blank text; surrounding whitespace is trimmed by the consumer. */
export const text = (max: number, description: string): JsonSchema => ({
  type: 'string',
  minLength: 1,
  maxLength: max,
  pattern: '\\S',
  description,
});

export const uuid = (description: string): JsonSchema => ({ type: 'string', format: 'uuid', description });

export const timestamp = (description: string): JsonSchema => ({ type: 'string', format: 'date-time', description });

export const enumOf = (values: Readonly<Record<string, string>>, description: string): JsonSchema => ({
  type: 'string',
  enum: Object.values(values),
  description,
});

export const freeObject = (description: string): JsonSchema => ({ type: 'object', description });

/** `null` or a referenced schema. */
export const nullableRef = (type: string, description: string): JsonSchema => ({
  anyOf: [ref(type), { type: 'null' }],
  description,
});

export const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
export const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
/** RFC 3339 date-time as produced by `Date.prototype.toISOString`. */
export const DATE_TIME_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$';
