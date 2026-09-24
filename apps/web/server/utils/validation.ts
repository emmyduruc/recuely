import {
  type AddVoiceFavoriteRequest,
  ApiErrorCode,
  type ApiErrorDetail,
  type CommandAliases,
  Intent,
  isValueOf,
  Locale,
  type MatchThresholds,
  Theme,
  type UpdateMeRequest,
  type UpdateSettingsRequest,
  UserLimits,
} from '@repo/contracts';
import { ApiException, HttpStatus, validationFailed } from './api-error';

// Typed guards for request bodies. Replaced by contract-schema validation (ajv) in Task 2.

type JsonObject = Readonly<Record<string, unknown>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(body: unknown): JsonObject {
  if (!isJsonObject(body)) {
    throw validationFailed([{ field: '(body)', issue: 'must be a JSON object' }]);
  }
  return body;
}

function checkKeys(body: JsonObject, allowed: readonly string[], issues: ApiErrorDetail[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      issues.push({ field: key, issue: 'unknown field' });
    }
  }
}

function readText(value: unknown, field: string, max: number, issues: ApiErrorDetail[]): string | undefined {
  if (typeof value !== 'string') {
    issues.push({ field, issue: 'must be a string' });
    return undefined;
  }
  const text = value.trim();
  if (text.length === 0 || text.length > max) {
    issues.push({ field, issue: `must be 1–${String(max)} characters` });
    return undefined;
  }
  return text;
}

function readNumber(value: unknown, field: string, min: number, max: number, issues: ApiErrorDetail[]): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    issues.push({ field, issue: `must be a number from ${String(min)} to ${String(max)}` });
    return undefined;
  }
  return value;
}

function finish<T>(issues: ApiErrorDetail[], value: T): T {
  if (issues.length > 0) {
    throw validationFailed(issues);
  }
  return value;
}

function requireSomeField(body: JsonObject, issues: ApiErrorDetail[]): void {
  if (Object.keys(body).length === 0) {
    issues.push({ field: '(body)', issue: 'must contain at least one field' });
  }
}

const UPDATE_ME_KEYS = ['displayName', 'email', 'locale'] as const;

export function parseUpdateMe(input: unknown): UpdateMeRequest {
  const body = requireObject(input);
  const issues: ApiErrorDetail[] = [];
  const result: UpdateMeRequest = {};
  requireSomeField(body, issues);
  checkKeys(body, UPDATE_ME_KEYS, issues);

  if ('displayName' in body) {
    const displayName = readText(body.displayName, 'displayName', UserLimits.displayNameMax, issues);
    if (displayName !== undefined) {
      result.displayName = displayName;
    }
  }
  if ('email' in body) {
    if (body.email === null) {
      result.email = null;
    } else {
      const email = readText(body.email, 'email', UserLimits.emailMax, issues);
      if (email !== undefined && !EMAIL_PATTERN.test(email)) {
        issues.push({ field: 'email', issue: 'must be an email address or null' });
      } else if (email !== undefined) {
        result.email = email;
      }
    }
  }
  if ('locale' in body) {
    if (isValueOf(Locale, body.locale)) {
      result.locale = body.locale;
    } else {
      issues.push({ field: 'locale', issue: `must be one of: ${Object.values(Locale).join(', ')}` });
    }
  }
  return finish(issues, result);
}

const UPDATE_SETTINGS_KEYS = [
  'defaultVoiceId',
  'defaultRate',
  'theme',
  'reducedMotion',
  'commandAliases',
  'matchThresholds',
] as const;

function readCommandAliases(value: unknown, issues: ApiErrorDetail[]): CommandAliases | undefined {
  if (!isJsonObject(value)) {
    issues.push({ field: 'commandAliases', issue: 'must be an object keyed by intent' });
    return undefined;
  }
  const aliases: CommandAliases = {};
  for (const [key, phrases] of Object.entries(value)) {
    const field = `commandAliases.${key}`;
    if (!isValueOf(Intent, key)) {
      issues.push({ field, issue: `unknown intent; use one of: ${Object.values(Intent).join(', ')}` });
      continue;
    }
    if (!Array.isArray(phrases) || phrases.length > UserLimits.aliasesPerIntentMax) {
      issues.push({ field, issue: `must be an array of at most ${String(UserLimits.aliasesPerIntentMax)} phrases` });
      continue;
    }
    const list = phrases.map((phrase: unknown, index) =>
      readText(phrase, `${field}[${String(index)}]`, UserLimits.aliasMax, issues),
    );
    aliases[key] = list.filter((phrase): phrase is string => phrase !== undefined);
  }
  return aliases;
}

function readMatchThresholds(value: unknown, issues: ApiErrorDetail[]): MatchThresholds | undefined {
  if (!isJsonObject(value)) {
    issues.push({ field: 'matchThresholds', issue: 'must be an object with coverage and similarity' });
    return undefined;
  }
  checkKeys(value, ['coverage', 'similarity'], issues);
  const coverage = readNumber(value.coverage, 'matchThresholds.coverage', 0, 1, issues);
  const similarity = readNumber(value.similarity, 'matchThresholds.similarity', 0, 1, issues);
  return coverage === undefined || similarity === undefined ? undefined : { coverage, similarity };
}

export function parseUpdateSettings(input: unknown): UpdateSettingsRequest {
  const body = requireObject(input);
  const issues: ApiErrorDetail[] = [];
  const result: UpdateSettingsRequest = {};
  requireSomeField(body, issues);
  checkKeys(body, UPDATE_SETTINGS_KEYS, issues);

  if ('defaultVoiceId' in body) {
    if (body.defaultVoiceId === null) {
      result.defaultVoiceId = null;
    } else {
      const voiceId = readText(body.defaultVoiceId, 'defaultVoiceId', UserLimits.voiceIdMax, issues);
      if (voiceId !== undefined) {
        result.defaultVoiceId = voiceId;
      }
    }
  }
  if ('defaultRate' in body) {
    const rate = readNumber(body.defaultRate, 'defaultRate', UserLimits.rateMin, UserLimits.rateMax, issues);
    if (rate !== undefined) {
      result.defaultRate = rate;
    }
  }
  if ('theme' in body) {
    if (isValueOf(Theme, body.theme)) {
      result.theme = body.theme;
    } else {
      issues.push({ field: 'theme', issue: `must be one of: ${Object.values(Theme).join(', ')}` });
    }
  }
  if ('reducedMotion' in body) {
    if (typeof body.reducedMotion === 'boolean') {
      result.reducedMotion = body.reducedMotion;
    } else {
      issues.push({ field: 'reducedMotion', issue: 'must be a boolean' });
    }
  }
  if ('commandAliases' in body) {
    const aliases = readCommandAliases(body.commandAliases, issues);
    if (aliases !== undefined) {
      result.commandAliases = aliases;
    }
  }
  if ('matchThresholds' in body) {
    const thresholds = readMatchThresholds(body.matchThresholds, issues);
    if (thresholds !== undefined) {
      result.matchThresholds = thresholds;
    }
  }
  return finish(issues, result);
}

const ADD_VOICE_KEYS = ['provider', 'voiceId', 'label'] as const;

export function parseAddVoiceFavorite(input: unknown): AddVoiceFavoriteRequest {
  const body = requireObject(input);
  const issues: ApiErrorDetail[] = [];
  checkKeys(body, ADD_VOICE_KEYS, issues);
  const provider = readText(body.provider, 'provider', UserLimits.providerMax, issues);
  const voiceId = readText(body.voiceId, 'voiceId', UserLimits.voiceIdMax, issues);
  const label = readText(body.label, 'label', UserLimits.labelMax, issues);
  if (provider === undefined || voiceId === undefined || label === undefined) {
    throw validationFailed(issues);
  }
  return finish(issues, { provider, voiceId, label });
}
