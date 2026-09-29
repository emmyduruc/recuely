import { ApiErrorCode, HealthStatus, Intent, Locale, Theme, UserLimits } from '@repo/contracts';
import {
  exampleAddVoiceFavorite,
  exampleHealth,
  exampleSettings,
  exampleUpdateMe,
  exampleUpdateSettings,
  exampleUser,
  exampleValidationError,
  exampleVoiceFavorite,
} from './examples';
import type { SchemaObject } from './types';

const timestamp = (description: string): SchemaObject => ({ type: 'string', format: 'date-time', description });

const matchThresholdsSchema: SchemaObject = {
  type: 'object',
  description: 'Auto-advance thresholds (SPEC.md §B7). Both are required when set.',
  required: ['coverage', 'similarity'],
  additionalProperties: false,
  properties: {
    coverage: { type: 'number', minimum: 0, maximum: 1, description: 'Share of chunk tokens that must be heard.' },
    similarity: { type: 'number', minimum: 0, maximum: 1, description: 'Minimum transcript-to-chunk similarity.' },
  },
  examples: [exampleSettings.matchThresholds],
};

const commandAliasesSchema: SchemaObject = {
  type: 'object',
  description: 'Extra spoken phrases per command intent, added to the built-in grammar (SPEC.md §B5).',
  propertyNames: { type: 'string', enum: Object.values(Intent), description: 'A command intent.' },
  additionalProperties: {
    type: 'array',
    maxItems: UserLimits.aliasesPerIntentMax,
    description: 'Phrases for this intent.',
    items: { type: 'string', minLength: 1, maxLength: UserLimits.aliasMax, description: 'One phrase.' },
  },
  examples: [exampleSettings.commandAliases],
};

/** Component schemas (SPEC.md §B5.1 rule 8): every schema and property is described. */
export const SCHEMAS = {
  Health: {
    type: 'object',
    description: 'Status of the web app, its database and the speech providers.',
    required: ['app', 'db', 'speech'],
    properties: {
      app: { type: 'string', enum: Object.values(HealthStatus), description: 'The web server itself.' },
      db: {
        type: 'string',
        enum: Object.values(HealthStatus),
        description: '`ok` when the database answers `SELECT 1` within 1 s, otherwise `unavailable`.',
      },
      speech: {
        type: 'object',
        description: 'Speech providers (SPEC.md §B12).',
        required: ['openai', 'local'],
        properties: {
          openai: {
            type: 'string',
            enum: Object.values(HealthStatus),
            description:
              '`unavailable` without OPENAI_API_KEY; `degraded` if an OpenAI request failed in the last minute; else `ok`. ' +
              'Never probed over the network (nothing reaches OpenAI without consent).',
          },
          local: {
            type: 'string',
            enum: Object.values(HealthStatus),
            description: "The local AI service's `/v0/health` within 1 s: `ok` (TTS and STT), `degraded` (one), `unavailable`.",
          },
        },
      },
    },
    examples: [exampleHealth],
  },
  User: {
    type: 'object',
    description: 'A user. R1 has exactly one local user; login arrives with its own spec.',
    required: ['id', 'email', 'displayName', 'locale', 'isLocal', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID v7.' },
      email: {
        type: ['string', 'null'],
        format: 'email',
        maxLength: UserLimits.emailMax,
        description: 'Optional email address, unique across users (case-insensitive).',
      },
      displayName: { type: 'string', maxLength: UserLimits.displayNameMax, description: 'Name shown in the UI.' },
      locale: { type: 'string', enum: Object.values(Locale), description: 'UI language (SPEC.md §B11).' },
      isLocal: { type: 'boolean', description: 'True for the seeded single local user.' },
      createdAt: timestamp('When the user was created.'),
      updatedAt: timestamp('When the user last changed.'),
    },
    examples: [exampleUser],
  },
  UpdateMeRequest: {
    type: 'object',
    description: 'Partial update of the current user. At least one field; unknown fields are rejected.',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      displayName: {
        type: 'string',
        minLength: 1,
        maxLength: UserLimits.displayNameMax,
        description: 'New display name (trimmed).',
      },
      email: {
        type: ['string', 'null'],
        format: 'email',
        maxLength: UserLimits.emailMax,
        description: 'New email address, or null to clear it.',
      },
      locale: { type: 'string', enum: Object.values(Locale), description: 'UI language.' },
    },
    examples: [exampleUpdateMe],
  },
  UserSettings: {
    type: 'object',
    description: 'Preferences of the current user.',
    required: ['defaultVoiceId', 'defaultRate', 'theme', 'reducedMotion', 'commandAliases', 'matchThresholds', 'cloudSpeechConsentAt', 'updatedAt'],
    properties: {
      defaultVoiceId: {
        type: ['string', 'null'],
        maxLength: UserLimits.voiceIdMax,
        description: 'Voice used when a session starts, or null for the provider default.',
      },
      defaultRate: {
        type: 'number',
        minimum: UserLimits.rateMin,
        maximum: UserLimits.rateMax,
        description: 'Speech rate multiplier for the assistant voice.',
      },
      theme: { type: 'string', enum: Object.values(Theme), description: 'Color theme (SPEC.md §B9).' },
      reducedMotion: { type: 'boolean', description: 'When true, UI changes are instant.' },
      commandAliases: { $ref: '#/components/schemas/CommandAliases', description: 'Extra command phrases.' },
      matchThresholds: { $ref: '#/components/schemas/MatchThresholds', description: 'Auto-advance thresholds.' },
      cloudSpeechConsentAt: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'When the user opted in to cloud speech (OpenAI), or null: speech stays local (SPEC.md §A6.8).',
      },
      updatedAt: timestamp('When the settings last changed.'),
    },
    examples: [exampleSettings],
  },
  UpdateSettingsRequest: {
    type: 'object',
    description:
      'Partial update of the settings. At least one field; unknown fields are rejected. ' +
      '`commandAliases` and `matchThresholds` replace the stored value whole.',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      defaultVoiceId: {
        type: ['string', 'null'],
        minLength: 1,
        maxLength: UserLimits.voiceIdMax,
        description: 'Voice id, or null to use the provider default.',
      },
      defaultRate: {
        type: 'number',
        minimum: UserLimits.rateMin,
        maximum: UserLimits.rateMax,
        description: 'Speech rate multiplier.',
      },
      theme: { type: 'string', enum: Object.values(Theme), description: 'Color theme.' },
      reducedMotion: { type: 'boolean', description: 'Turn reduced motion on or off.' },
      commandAliases: { $ref: '#/components/schemas/CommandAliases', description: 'Replacement alias map.' },
      matchThresholds: { $ref: '#/components/schemas/MatchThresholds', description: 'Replacement thresholds.' },
      cloudSpeechConsent: {
        type: 'boolean',
        description:
          'true opts in to cloud speech: chunk text (TTS) and take audio (STT) are sent to OpenAI. The time is ' +
          'recorded once; false revokes it and everything stays local (SPEC.md §A6.8, §B12).',
      },
    },
    examples: [exampleUpdateSettings],
  },
  CommandAliases: commandAliasesSchema,
  MatchThresholds: matchThresholdsSchema,
  VoiceFavorite: {
    type: 'object',
    description: 'A voice the user marked as favorite.',
    required: ['id', 'provider', 'voiceId', 'label', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'UUID v7 of the favorite.' },
      provider: { type: 'string', maxLength: UserLimits.providerMax, description: 'TTS provider, e.g. `kokoro`.' },
      voiceId: { type: 'string', maxLength: UserLimits.voiceIdMax, description: "The provider's voice id." },
      label: { type: 'string', maxLength: UserLimits.labelMax, description: 'Name shown in the voice picker.' },
      createdAt: timestamp('When the voice was added.'),
    },
    examples: [exampleVoiceFavorite],
  },
  AddVoiceFavoriteRequest: {
    type: 'object',
    description: 'A voice to add to the favorites. (provider, voiceId) must not already be a favorite.',
    required: ['provider', 'voiceId', 'label'],
    additionalProperties: false,
    properties: {
      provider: { type: 'string', minLength: 1, maxLength: UserLimits.providerMax, description: 'TTS provider.' },
      voiceId: { type: 'string', minLength: 1, maxLength: UserLimits.voiceIdMax, description: 'Provider voice id.' },
      label: { type: 'string', minLength: 1, maxLength: UserLimits.labelMax, description: 'Display label.' },
    },
    examples: [exampleAddVoiceFavorite],
  },
  ApiError: {
    type: 'object',
    description: 'The body of every error response from the web API (SPEC.md §B5.1).',
    required: ['statusCode', 'code', 'message'],
    properties: {
      statusCode: { type: 'integer', description: 'HTTP status code, repeated in the body.' },
      code: { type: 'string', enum: Object.values(ApiErrorCode), description: 'Stable machine-readable code.' },
      message: { type: 'string', description: 'Human-readable explanation, safe to show.' },
      details: {
        type: 'array',
        description: 'Per-field validation problems (only for validation errors).',
        items: { $ref: '#/components/schemas/ApiErrorDetail', description: 'One problem.' },
      },
    },
    examples: [exampleValidationError],
  },
  ApiErrorDetail: {
    type: 'object',
    description: 'One validation problem.',
    required: ['field', 'issue'],
    properties: {
      field: { type: 'string', description: 'Dotted path of the offending field, or `(body)`.' },
      issue: { type: 'string', description: 'What is wrong with it.' },
    },
    examples: [exampleValidationError.details?.[0]],
  },
} as const satisfies Record<string, SchemaObject>;

export type SchemaName = keyof typeof SCHEMAS;

export function ref(name: SchemaName): SchemaObject {
  return { $ref: `#/components/schemas/${name}` };
}
