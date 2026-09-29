import { ContractType, type JsonSchema, SCHEMAS } from '@repo/contracts';
import type { SchemaObject } from './types';

// Task 4+ components come straight from the contract schemas (JSON Schema 2020-12 is OpenAPI 3.1's dialect),
// so the documented shapes are the validated shapes: no second copy to drift.

const FILE_REF = /\.json$/;

export function componentRef(type: ContractType): SchemaObject {
  return { $ref: `#/components/schemas/${type}` };
}

function convertMap(map: Readonly<Record<string, JsonSchema>> | undefined): Record<string, SchemaObject> | undefined {
  return map === undefined ? undefined : Object.fromEntries(Object.entries(map).map(([key, value]) => [key, toOpenApiSchema(value)]));
}

/** Drops `$schema`/`$id`/`title` and rewrites `X.json` refs to `#/components/schemas/X`. */
export function toOpenApiSchema(schema: JsonSchema): SchemaObject {
  const properties = convertMap(schema.properties);
  const additional = schema.additionalProperties;
  return {
    ...(schema.$ref === undefined ? {} : { $ref: `#/components/schemas/${schema.$ref.replace(FILE_REF, '')}` }),
    ...(schema.type === undefined ? {} : { type: schema.type }),
    ...(schema.description === undefined ? {} : { description: schema.description }),
    ...(schema.format === undefined ? {} : { format: schema.format }),
    ...(schema.enum === undefined ? {} : { enum: schema.enum }),
    ...(schema.pattern === undefined ? {} : { pattern: schema.pattern }),
    ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }),
    ...(schema.maxLength === undefined ? {} : { maxLength: schema.maxLength }),
    ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
    ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }),
    ...(schema.minItems === undefined ? {} : { minItems: schema.minItems }),
    ...(schema.maxItems === undefined ? {} : { maxItems: schema.maxItems }),
    ...(schema.minProperties === undefined ? {} : { minProperties: schema.minProperties }),
    ...(schema.required === undefined ? {} : { required: schema.required }),
    ...(properties === undefined ? {} : { properties }),
    ...(schema.items === undefined ? {} : { items: toOpenApiSchema(schema.items) }),
    ...(additional === undefined ? {} : { additionalProperties: typeof additional === 'boolean' ? additional : toOpenApiSchema(additional) }),
    ...(schema.propertyNames === undefined ? {} : { propertyNames: toOpenApiSchema(schema.propertyNames) }),
    ...(schema.anyOf === undefined ? {} : { anyOf: schema.anyOf.map(toOpenApiSchema) }),
    ...(schema.examples === undefined ? {} : { examples: schema.examples }),
  };
}

/** Contract schemas published as components (Task 4 resources, plus what they reference). */
export const CONTRACT_COMPONENT_TYPES: readonly ContractType[] = [
  ContractType.Project,
  ContractType.CreateProjectRequest,
  ContractType.UpdateProjectRequest,
  ContractType.ScriptBlock,
  ContractType.ScriptChunk,
  ContractType.ScriptSummary,
  ContractType.Script,
  ContractType.CreateScriptRequest,
  ContractType.ChunkPlan,
  ContractType.CreateChunkPlanRequest,
  ContractType.Session,
  ContractType.CreateSessionRequest,
  ContractType.UpdateSessionRequest,
  ContractType.Take,
  ContractType.CreateTakeRequest,
  ContractType.UpdateTakeRequest,
  ContractType.Export,
  ContractType.CreateExportRequest,
  ContractType.MatchResult,
  ContractType.TextSpan,
  ContractType.WordTiming,
  ContractType.TtsRequest,
  ContractType.SpeechTtsResult,
  ContractType.SpeechSttResult,
  ContractType.SpeechVoice,
];

export const CONTRACT_COMPONENTS: Readonly<Record<string, SchemaObject>> = Object.fromEntries(
  CONTRACT_COMPONENT_TYPES.map((type) => [type, toOpenApiSchema(SCHEMAS[type])]),
);

/** First example of a contract schema, for request/response examples. */
export function contractExample(type: ContractType): unknown {
  return SCHEMAS[type].examples?.[0];
}
