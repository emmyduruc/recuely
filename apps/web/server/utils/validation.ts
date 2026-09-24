import {
  type AddVoiceFavoriteRequest,
  ApiErrorCode,
  type CommandAliases,
  ContractType,
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
function parseBody<K extends ContractType>(type: K, body: unknown): ContractTypes[K] {
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
