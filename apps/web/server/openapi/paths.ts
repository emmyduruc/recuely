import type { ApiError } from '@repo/contracts';
import {
  exampleAddVoiceFavorite,
  exampleBadJsonError,
  exampleConflictError,
  exampleHealth,
  exampleNotFoundError,
  exampleServerError,
  exampleSettings,
  exampleUnavailableError,
  exampleUpdateMe,
  exampleUpdateSettings,
  exampleUser,
  exampleValidationError,
  exampleVoiceFavorite,
} from './examples';
import { ref, type SchemaName } from './schemas';
import { ApiTag } from './tags';
import type { OperationObject, PathItemObject, RequestBodyObject, ResponseObject } from './types';

function json(description: string, schema: SchemaName, example: unknown): ResponseObject {
  return { description, content: { 'application/json': { schema: ref(schema), example } } };
}

function jsonList(description: string, schema: SchemaName, example: unknown): ResponseObject {
  return {
    description,
    content: { 'application/json': { schema: { type: 'array', items: ref(schema) }, example } },
  };
}

function body(description: string, schema: SchemaName, example: unknown): RequestBodyObject {
  return { required: true, description, content: { 'application/json': { schema: ref(schema), example } } };
}

function error(description: string, example: ApiError): ResponseObject {
  return json(description, 'ApiError', example);
}

/** Errors every database-backed operation can return. */
const DB_ERRORS = {
  500: error('The local user is missing (run `pnpm db:seed`) or an unexpected error occurred.', exampleServerError),
  503: error('The database is not configured or unreachable.', exampleUnavailableError),
} as const;

const BODY_ERRORS = {
  400: error('The body is not valid JSON.', exampleBadJsonError),
  422: error('The body failed validation; `details` lists each problem.', exampleValidationError),
} as const;

const getHealth: OperationObject = {
  tags: [ApiTag.Health],
  operationId: 'getHealth',
  summary: 'Report app and database status',
  description:
    'Always answers 200 while the server runs. `db` is `ok` when the database answers within 1 s. ' +
    'No side effects; safe to poll.',
  responses: {
    200: json('Current status.', 'Health', exampleHealth),
    500: error('An unexpected error occurred.', exampleServerError),
  },
};

const getMe: OperationObject = {
  tags: [ApiTag.User],
  operationId: 'getMe',
  summary: 'Get the current user',
  description: 'Returns the seeded local user (R1 has no login). Read-only.',
  responses: { 200: json('The current user.', 'User', exampleUser), ...DB_ERRORS },
};

const updateMe: OperationObject = {
  tags: [ApiTag.User],
  operationId: 'updateMe',
  summary: 'Update the current user',
  description:
    'Changes only the fields sent. Idempotent: sending the same body twice gives the same result. ' +
    'Email must be unique across users (case-insensitive).',
  requestBody: body('Fields to change.', 'UpdateMeRequest', exampleUpdateMe),
  responses: {
    200: json('The updated user.', 'User', { ...exampleUser, ...exampleUpdateMe }),
    ...BODY_ERRORS,
    409: error('Another user already has this email address.', {
      ...exampleConflictError,
      message: 'Another user already has this email address.',
    }),
    ...DB_ERRORS,
  },
};

const getSettings: OperationObject = {
  tags: [ApiTag.Settings],
  operationId: 'getSettings',
  summary: 'Get the current user settings',
  description: 'Returns the settings, creating the defaults first if they are missing.',
  responses: { 200: json('The settings.', 'UserSettings', exampleSettings), ...DB_ERRORS },
};

const updateSettings: OperationObject = {
  tags: [ApiTag.Settings],
  operationId: 'updateSettings',
  summary: 'Update the current user settings',
  description:
    'Changes only the fields sent; `commandAliases` and `matchThresholds` replace the stored value whole. ' +
    'Idempotent.',
  requestBody: body('Fields to change.', 'UpdateSettingsRequest', exampleUpdateSettings),
  responses: {
    200: json('The updated settings.', 'UserSettings', { ...exampleSettings, ...exampleUpdateSettings }),
    ...BODY_ERRORS,
    ...DB_ERRORS,
  },
};

const listFavoriteVoices: OperationObject = {
  tags: [ApiTag.Voices],
  operationId: 'listFavoriteVoices',
  summary: 'List favorite voices',
  description: 'Returns the favorites in the order they were added. Read-only.',
  responses: { 200: jsonList('The favorites, oldest first.', 'VoiceFavorite', [exampleVoiceFavorite]), ...DB_ERRORS },
};

const addFavoriteVoice: OperationObject = {
  tags: [ApiTag.Voices],
  operationId: 'addFavoriteVoice',
  summary: 'Add a favorite voice',
  description: 'Stores a voice as favorite. Not idempotent: the same (provider, voiceId) twice is a 409.',
  requestBody: body('The voice to add.', 'AddVoiceFavoriteRequest', exampleAddVoiceFavorite),
  responses: {
    201: json('The stored favorite.', 'VoiceFavorite', exampleVoiceFavorite),
    ...BODY_ERRORS,
    409: error('This voice is already a favorite.', exampleConflictError),
    ...DB_ERRORS,
  },
};

const removeFavoriteVoice: OperationObject = {
  tags: [ApiTag.Voices],
  operationId: 'removeFavoriteVoice',
  summary: 'Remove a favorite voice',
  description:
    'Removes one favorite of the current user. Only the favorite entry is deleted, never any audio or take. ' +
    'A second call for the same id answers 404.',
  parameters: [
    {
      name: 'id',
      in: 'path',
      required: true,
      description: 'Id of the favorite to remove.',
      schema: { type: 'string', format: 'uuid', description: 'UUID v7.' },
      example: exampleVoiceFavorite.id,
    },
  ],
  responses: {
    204: { description: 'Removed. No body.' },
    404: error('No favorite with this id belongs to the user.', exampleNotFoundError),
    ...DB_ERRORS,
  },
};

export const PATHS: Readonly<Record<string, PathItemObject>> = {
  '/api/health': { get: getHealth },
  '/api/me': { get: getMe, patch: updateMe },
  '/api/me/settings': { get: getSettings, patch: updateSettings },
  '/api/me/voices': { get: listFavoriteVoices, post: addFavoriteVoice },
  '/api/me/voices/{id}': { delete: removeFavoriteVoice },
};
