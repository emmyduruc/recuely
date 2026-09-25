import {
  type AddVoiceFavoriteRequest,
  ApiErrorCode,
  type CommandAliases,
  ContractType,
  type CreateProjectRequest,
  type UpdateProjectRequest,
  type ContractTypes,
  type UpdateMeRequest,
  type UpdateSettingsRequest,
} from '@repo/contracts';
import { validateContract } from '@repo/contracts/validation';
import { ApiException, HttpStatus, validationFailed } from './api-error';

// Request bodies are checked against the shared contract schemas (SPEC.md Task 2), then normalized.

const BODY_FIELD = '(body)';
const ROOT_PATH = '(root)';

export function parseJsonBody(raw: string | undefined): unknown {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiException(HttpStatus.BadRequest, ApiErrorCode.ValidationFailed, 'The request body is not valid JSON.');
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Schema-validates a JSON object body; issues become `ApiError.details` (`(root)` → `(body)`). */
export function parseBody<K extends ContractType>(type: K, body: unknown): ContractTypes[K] {
  if (!isJsonObject(body)) {
    throw validationFailed([{ field: BODY_FIELD, issue: 'must be a JSON object' }]);
  }
  const result = validateContract(type, body);
  if (!result.ok) {
    throw validationFailed(
      result.issues.map(({ path, issue }) => ({ field: path === ROOT_PATH ? BODY_FIELD : path, issue })),
    );
  }
  return result.value;
}

function trimAliases(aliases: CommandAliases): CommandAliases {
  return Object.fromEntries(
    Object.entries(aliases).map(([intent, phrases]) => [intent, phrases.map((phrase) => phrase.trim())]),
  );
}

export function parseUpdateMe(input: unknown): UpdateMeRequest {
  const body = parseBody(ContractType.UpdateMeRequest, input);
  return {
    ...body,
    ...(body.displayName === undefined ? {} : { displayName: body.displayName.trim() }),
    ...(typeof body.email === 'string' ? { email: body.email.trim() } : {}),
  };
}

export function parseUpdateSettings(input: unknown): UpdateSettingsRequest {
  const body = parseBody(ContractType.UpdateSettingsRequest, input);
  return {
    ...body,
    ...(typeof body.defaultVoiceId === 'string' ? { defaultVoiceId: body.defaultVoiceId.trim() } : {}),
    ...(body.commandAliases === undefined ? {} : { commandAliases: trimAliases(body.commandAliases) }),
  };
}

export function parseAddVoiceFavorite(input: unknown): AddVoiceFavoriteRequest {
  const body = parseBody(ContractType.AddVoiceFavoriteRequest, input);
  return { provider: body.provider.trim(), voiceId: body.voiceId.trim(), label: body.label.trim() };
}

export function parseCreateProject(input: unknown): CreateProjectRequest {
  return { title: parseBody(ContractType.CreateProjectRequest, input).title.trim() };
}

export function parseUpdateProject(input: unknown): UpdateProjectRequest {
  const body = parseBody(ContractType.UpdateProjectRequest, input);
  return { ...body, ...(body.title === undefined ? {} : { title: body.title.trim() }) };
}

const TRUE_QUERY_VALUES = new Set(['true', '1']);

/** `?flag=true` / `?flag=1` → true; absent or anything else → false. */
export function queryFlag(value: unknown): boolean {
  return typeof value === 'string' && TRUE_QUERY_VALUES.has(value.toLowerCase());
}
