import {
  type AddVoiceFavoriteRequest,
  type ApiError,
  ApiErrorCode,
  type AppHealth,
  HealthStatus,
  Intent,
  Locale,
  Theme,
  type UpdateMeRequest,
  type UpdateSettingsRequest,
  type User,
  type UserSettings,
  type VoiceFavorite,
} from '@repo/contracts';

// Typed examples: a contract change that breaks an example is a compile error.

export const exampleUser: User = {
  id: '0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b',
  email: null,
  displayName: 'Local creator',
  locale: Locale.En,
  isLocal: true,
  createdAt: '2026-09-24T09:30:00.000Z',
  updatedAt: '2026-09-24T09:30:00.000Z',
};

export const exampleUpdateMe: UpdateMeRequest = { displayName: 'Ada', email: 'ada@example.com' };

export const exampleSettings: UserSettings = {
  defaultVoiceId: 'af_heart',
  defaultRate: 1,
  theme: Theme.Dark,
  reducedMotion: false,
  commandAliases: { [Intent.Next]: ['onward'] },
  matchThresholds: { coverage: 0.8, similarity: 0.7 },
  updatedAt: '2026-09-24T09:31:00.000Z',
};

export const exampleUpdateSettings: UpdateSettingsRequest = { defaultRate: 0.9, theme: Theme.Light };

export const exampleVoiceFavorite: VoiceFavorite = {
  id: '0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c',
  provider: 'kokoro',
  voiceId: 'af_heart',
  label: 'Heart (warm, US)',
  createdAt: '2026-09-24T09:32:00.000Z',
};

export const exampleAddVoiceFavorite: AddVoiceFavoriteRequest = {
  provider: 'kokoro',
  voiceId: 'af_heart',
  label: 'Heart (warm, US)',
};

export const exampleHealth: AppHealth = { app: HealthStatus.Ok, db: HealthStatus.Ok };

export const exampleValidationError: ApiError = {
  statusCode: 422,
  code: ApiErrorCode.ValidationFailed,
  message: 'The request body is invalid.',
  details: [{ field: 'defaultRate', issue: 'must be at most 2' }],
};

export const exampleBadJsonError: ApiError = {
  statusCode: 400,
  code: ApiErrorCode.ValidationFailed,
  message: 'The request body is not valid JSON.',
};

export const exampleNotFoundError: ApiError = {
  statusCode: 404,
  code: ApiErrorCode.NotFound,
  message: 'No favorite voice with this id.',
};

export const exampleConflictError: ApiError = {
  statusCode: 409,
  code: ApiErrorCode.Conflict,
  message: 'This voice is already a favorite.',
};

export const exampleServerError: ApiError = {
  statusCode: 500,
  code: ApiErrorCode.LocalUserMissing,
  message: 'No local user exists. Run `pnpm db:seed`.',
};

export const exampleUnavailableError: ApiError = {
  statusCode: 503,
  code: ApiErrorCode.DatabaseUnavailable,
  message: 'DATABASE_URL is not set. Put your Neon connection string in the repo-root .env (see .env.example).',
};
