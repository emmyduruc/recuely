import { Intent } from '../intent.ts';
import { Locale } from '../locale.ts';
import {
  type CommandEvent,
  type CommandGrammar,
  CommandSource,
  type Envelope,
  MatchDecision,
  type MatchResult,
  type TextSpan,
  TimingSource,
  type TtsResult,
  type WordTiming,
} from '../payloads.ts';
import { Theme } from '../theme.ts';
import {
  type AddVoiceFavoriteRequest,
  type MatchThresholds,
  type UpdateMeRequest,
  type UpdateSettingsRequest,
  UserLimits,
} from '../user.ts';
import type {
  ChunkPlanResource,
  CreateChunkPlanRequest,
  CreateExportRequest,
  CreateProjectRequest,
  CreateScriptRequest,
  CreateSessionRequest,
  CreateTakeRequest,
  Export,
  Project,
  Script,
  ScriptSummary,
  Session,
  Take,
  UpdateProjectRequest,
  UpdateSessionRequest,
  UpdateTakeRequest,
} from '../recording.ts';
import type { ScriptBlock, ScriptChunk } from '../script.ts';
import { EMAIL_PATTERN, nonNegativeInt, ref, text, unit } from './helpers.ts';
import { JSON_SCHEMA_DIALECT, type JsonSchema, nullable, objectSchema } from './json-schema.ts';
import { RECORDING_SCHEMAS } from './recording.ts';

export * from './helpers.ts';
export * from './json-schema.ts';
export { MEDIA_TYPE_PATTERN } from './recording.ts';

/** Every contract with a schema. Payloads are shared with Python; API bodies are web-only. */
export const ContractType = {
  Envelope: 'Envelope',
  WordTiming: 'WordTiming',
  TtsResult: 'TtsResult',
  TextSpan: 'TextSpan',
  MatchResult: 'MatchResult',
  CommandEvent: 'CommandEvent',
  CommandGrammar: 'CommandGrammar',
  UpdateMeRequest: 'UpdateMeRequest',
  UpdateSettingsRequest: 'UpdateSettingsRequest',
  AddVoiceFavoriteRequest: 'AddVoiceFavoriteRequest',
  Project: 'Project',
  CreateProjectRequest: 'CreateProjectRequest',
  UpdateProjectRequest: 'UpdateProjectRequest',
  ScriptBlock: 'ScriptBlock',
  ScriptChunk: 'ScriptChunk',
  ScriptSummary: 'ScriptSummary',
  Script: 'Script',
  CreateScriptRequest: 'CreateScriptRequest',
  ChunkPlan: 'ChunkPlan',
  CreateChunkPlanRequest: 'CreateChunkPlanRequest',
  Session: 'Session',
  CreateSessionRequest: 'CreateSessionRequest',
  UpdateSessionRequest: 'UpdateSessionRequest',
  Take: 'Take',
  CreateTakeRequest: 'CreateTakeRequest',
  UpdateTakeRequest: 'UpdateTakeRequest',
  Export: 'Export',
  CreateExportRequest: 'CreateExportRequest',
} as const;
export type ContractType = (typeof ContractType)[keyof typeof ContractType];

/** The TS type each contract validates to. */
export interface ContractTypes {
  [ContractType.Envelope]: Envelope;
  [ContractType.WordTiming]: WordTiming;
  [ContractType.TtsResult]: TtsResult;
  [ContractType.TextSpan]: TextSpan;
  [ContractType.MatchResult]: MatchResult;
  [ContractType.CommandEvent]: CommandEvent;
  [ContractType.CommandGrammar]: CommandGrammar;
  [ContractType.UpdateMeRequest]: UpdateMeRequest;
  [ContractType.UpdateSettingsRequest]: UpdateSettingsRequest;
  [ContractType.AddVoiceFavoriteRequest]: AddVoiceFavoriteRequest;
  [ContractType.Project]: Project;
  [ContractType.CreateProjectRequest]: CreateProjectRequest;
  [ContractType.UpdateProjectRequest]: UpdateProjectRequest;
  [ContractType.ScriptBlock]: ScriptBlock;
  [ContractType.ScriptChunk]: ScriptChunk;
  [ContractType.ScriptSummary]: ScriptSummary;
  [ContractType.Script]: Script;
  [ContractType.CreateScriptRequest]: CreateScriptRequest;
  [ContractType.ChunkPlan]: ChunkPlanResource;
  [ContractType.CreateChunkPlanRequest]: CreateChunkPlanRequest;
  [ContractType.Session]: Session;
  [ContractType.CreateSessionRequest]: CreateSessionRequest;
  [ContractType.UpdateSessionRequest]: UpdateSessionRequest;
  [ContractType.Take]: Take;
  [ContractType.CreateTakeRequest]: CreateTakeRequest;
  [ContractType.UpdateTakeRequest]: UpdateTakeRequest;
  [ContractType.Export]: Export;
  [ContractType.CreateExportRequest]: CreateExportRequest;
}

/** Lower-case words, optionally ending in the `{target}` placeholder. */
const grammarPhrases = (intent: Intent): JsonSchema => ({
  type: 'array',
  minItems: 1,
  description: `Phrases for ${intent}.`,
  items: { type: 'string', pattern: '^[a-z]+( [a-z]+)*( \\{target\\})?$' },
});

const envelope = objectSchema<Envelope>()({
  type: 'object',
  description: 'Envelope of every event/message. Consumers ignore unknown fields and reject a different major `v`.',
  properties: {
    v: { type: 'string', pattern: '^0\\.\\d+$', description: 'Contract major.minor; major must be 0.' },
    type: { type: 'string', minLength: 1, description: 'Message type.' },
    id: { type: 'string', minLength: 1, description: 'Unique message id.' },
    sessionId: { type: 'string', minLength: 1, description: 'Session the message belongs to.' },
    chunkId: { type: 'string', minLength: 1, description: 'Chunk the message belongs to.' },
    seq: nonNegativeInt('Engine sequence number; stale results (lower seq) are dropped.'),
    requestId: { type: 'string', minLength: 1, description: 'Correlates a response with its request.' },
    t: { type: 'number', minimum: 0, description: 'Monotonic timestamp in ms.' },
    payload: { type: 'object', description: 'Message-specific payload.' },
  },
  required: ['v', 'type', 'id', 't', 'payload'],
  additionalProperties: true,
});

const wordTiming = objectSchema<WordTiming>()({
  type: 'object',
  description: 'One spoken word. Times are ms from audio start; offsets are UTF-16 code units (SPEC.md §B5).',
  properties: {
    index: nonNegativeInt('Word index within the chunk.'),
    start: { type: 'number', minimum: 0, description: 'Start time in ms.' },
    end: { type: 'number', minimum: 0, description: 'End time in ms; ≥ start.' },
    charStart: nonNegativeInt('First UTF-16 code unit of the word.'),
    charEnd: nonNegativeInt('UTF-16 code unit after the word; ≥ charStart.'),
  },
  required: ['index', 'start', 'end', 'charStart', 'charEnd'],
  additionalProperties: true,
});

const ttsResult = objectSchema<TtsResult>()({
  type: 'object',
  description: 'Synthesized audio for one chunk. `timings` is null exactly when `timingSource` is `none`.',
  properties: {
    audioUrl: { type: 'string', minLength: 1, description: 'Where to fetch the audio.' },
    durationMs: { type: 'number', minimum: 0, description: 'Audio duration in ms.' },
    timings: { type: ['array', 'null'], items: ref(ContractType.WordTiming), description: 'Word timings or null.' },
    timingSource: { type: 'string', enum: Object.values(TimingSource), description: 'Origin of the timings.' },
    cacheKey: { type: 'string', minLength: 1, description: 'Key of the cached audio.' },
  },
  required: ['audioUrl', 'durationMs', 'timings', 'timingSource', 'cacheKey'],
  additionalProperties: true,
});

const textSpan = objectSchema<TextSpan>()({
  type: 'object',
  description: 'A range of chunk text in UTF-16 code units; charEnd ≥ charStart.',
  properties: {
    charStart: nonNegativeInt('First UTF-16 code unit.'),
    charEnd: nonNegativeInt('UTF-16 code unit after the span.'),
  },
  required: ['charStart', 'charEnd'],
  additionalProperties: true,
  examples: [{ charStart: 40, charEnd: 58 }],
});

const matchResult = objectSchema<MatchResult>()({
  type: 'object',
  description: 'How well a take matched its chunk, and whether to advance (SPEC.md §B7).',
  properties: {
    coverage: unit('Share of chunk tokens heard.'),
    similarity: unit('Transcript-to-chunk similarity.'),
    missingSpans: { type: 'array', items: ref(ContractType.TextSpan), description: 'Chunk text not heard.' },
    decision: { type: 'string', enum: Object.values(MatchDecision), description: 'Advance, or ask the creator.' },
    reasons: { type: 'array', items: { type: 'string' }, description: 'Why this decision was made.' },
  },
  required: ['coverage', 'similarity', 'missingSpans', 'decision', 'reasons'],
  additionalProperties: true,
  examples: [{ coverage: 0.93, similarity: 0.88, missingSpans: [], decision: MatchDecision.Advance, reasons: ['coverage 0.93 ≥ 0.80'] }],
});

const commandEvent = objectSchema<CommandEvent>()({
  type: 'object',
  description: 'A recognized command, from voice, touch or keyboard.',
  properties: {
    intent: { type: 'string', enum: Object.values(Intent), description: 'The command.' },
    args: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Command arguments, e.g. `target` for NAVIGATE.',
    },
    source: { type: 'string', enum: Object.values(CommandSource), description: 'How the command was given.' },
    utterance: { type: 'string', description: 'What was said (voice only).' },
    confidence: unit('Recognizer confidence (voice only).'),
  },
  required: ['intent', 'source'],
  additionalProperties: true,
});

const commandGrammar = objectSchema<CommandGrammar>()({
  type: 'object',
  description: 'Spoken phrases per intent for one locale (SPEC.md §B5).',
  properties: {
    locale: { type: 'string', enum: Object.values(Locale), description: 'Language of the phrases.' },
    intents: {
      type: 'object',
      description: 'Phrases per intent; every intent must be present.',
      properties: Object.fromEntries(Object.values(Intent).map((intent) => [intent, grammarPhrases(intent)])),
      required: Object.values(Intent),
      additionalProperties: false,
    },
  },
  required: ['locale', 'intents'],
  additionalProperties: false,
});

const updateMe = objectSchema<UpdateMeRequest>()({
  type: 'object',
  description: 'PATCH /api/me body. At least one field; unknown fields are rejected.',
  properties: {
    displayName: text(UserLimits.displayNameMax, 'New display name.'),
    email: {
      ...nullable({ type: 'string', maxLength: UserLimits.emailMax, pattern: EMAIL_PATTERN }),
      description: 'Email address, or null to clear it.',
    },
    locale: { type: 'string', enum: Object.values(Locale), description: 'UI language.' },
  },
  required: [],
  minProperties: 1,
  additionalProperties: false,
});

const matchThresholds = objectSchema<MatchThresholds>()({
  type: 'object',
  description: 'Auto-advance thresholds.',
  properties: {
    coverage: unit('Minimum coverage.'),
    similarity: unit('Minimum similarity.'),
  },
  required: ['coverage', 'similarity'],
  additionalProperties: false,
});

const updateSettings = objectSchema<UpdateSettingsRequest>()({
  type: 'object',
  description: 'PATCH /api/me/settings body. At least one field; unknown fields are rejected.',
  properties: {
    defaultVoiceId: {
      ...nullable({ type: 'string', minLength: 1, maxLength: UserLimits.voiceIdMax, pattern: '\\S' }),
      description: 'Voice id, or null for the provider default.',
    },
    defaultRate: {
      type: 'number',
      minimum: UserLimits.rateMin,
      maximum: UserLimits.rateMax,
      description: 'Speech rate multiplier.',
    },
    theme: { type: 'string', enum: Object.values(Theme), description: 'Color theme.' },
    reducedMotion: { type: 'boolean', description: 'Reduced motion on or off.' },
    commandAliases: {
      type: 'object',
      description: 'Extra phrases per intent (replaces the stored map).',
      propertyNames: { enum: Object.values(Intent) },
      additionalProperties: {
        type: 'array',
        maxItems: UserLimits.aliasesPerIntentMax,
        items: text(UserLimits.aliasMax, 'One phrase.'),
      },
    },
    matchThresholds: { ...matchThresholds, description: 'Replacement thresholds.' },
  },
  required: [],
  minProperties: 1,
  additionalProperties: false,
});

const addVoiceFavorite = objectSchema<AddVoiceFavoriteRequest>()({
  type: 'object',
  description: 'POST /api/me/voices body.',
  properties: {
    provider: text(UserLimits.providerMax, 'TTS provider.'),
    voiceId: text(UserLimits.voiceIdMax, "The provider's voice id."),
    label: text(UserLimits.labelMax, 'Label shown in the picker.'),
  },
  required: ['provider', 'voiceId', 'label'],
  additionalProperties: false,
});

const DEFINITIONS: Record<ContractType, JsonSchema> = {
  [ContractType.Envelope]: envelope,
  [ContractType.WordTiming]: wordTiming,
  [ContractType.TtsResult]: ttsResult,
  [ContractType.TextSpan]: textSpan,
  [ContractType.MatchResult]: matchResult,
  [ContractType.CommandEvent]: commandEvent,
  [ContractType.CommandGrammar]: commandGrammar,
  [ContractType.UpdateMeRequest]: updateMe,
  [ContractType.UpdateSettingsRequest]: updateSettings,
  [ContractType.AddVoiceFavoriteRequest]: addVoiceFavorite,
  ...RECORDING_SCHEMAS,
};

/** Published schemas: `$id` is `<Type>.json`, so `$ref`s resolve between files and inside ajv alike. */
export const SCHEMAS: Readonly<Record<ContractType, JsonSchema>> = Object.fromEntries(
  Object.values(ContractType).map((type) => [
    type,
    { $schema: JSON_SCHEMA_DIALECT, $id: `${type}.json`, title: type, ...DEFINITIONS[type] },
  ]),
) as Record<ContractType, JsonSchema>;

/** Contracts the Python AI service mirrors with Pydantic models. */
export const SHARED_CONTRACTS: readonly ContractType[] = [
  ContractType.Envelope,
  ContractType.WordTiming,
  ContractType.TtsResult,
  ContractType.TextSpan,
  ContractType.MatchResult,
  ContractType.CommandEvent,
  ContractType.CommandGrammar,
];
