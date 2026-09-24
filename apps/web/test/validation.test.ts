import { ApiErrorCode, Intent, Theme } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { ApiException, toApiError } from '../server/utils/api-error';
import { parseAddVoiceFavorite, parseJsonBody, parseUpdateMe, parseUpdateSettings } from '../server/utils/validation';

function issuesOf(action: () => unknown): string[] {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiException) {
      return (error.details ?? []).map((detail) => `${detail.field}: ${detail.issue}`);
    }
    throw error;
  }
  throw new Error('expected a validation error');
}

describe('request validation', () => {
  it('T1: parseUpdateMe accepts valid fields and trims text', () => {
    expect(parseUpdateMe({ displayName: '  Ada ', email: 'ada@example.com' })).toEqual({
      displayName: 'Ada',
      email: 'ada@example.com',
    });
    expect(parseUpdateMe({ email: null })).toEqual({ email: null });
  });

  it('T1: parseUpdateMe rejects unknown fields, bad email, unsupported locale and empty bodies', () => {
    expect(issuesOf(() => parseUpdateMe({ nickname: 'x' }))).toEqual(['nickname: unknown field']);
    expect(issuesOf(() => parseUpdateMe({ email: 'nope' }))).toEqual(['email: must be an email address or null']);
    expect(issuesOf(() => parseUpdateMe({ locale: 'de' }))).toEqual(['locale: must be one of: en']);
    expect(issuesOf(() => parseUpdateMe({}))).toEqual(['(body): must contain at least one field']);
    expect(issuesOf(() => parseUpdateMe([]))).toEqual(['(body): must be a JSON object']);
  });

  it('T1: parseUpdateSettings accepts every field', () => {
    const body = {
      defaultVoiceId: 'af_heart',
      defaultRate: 0.9,
      theme: Theme.Light,
      reducedMotion: true,
      commandAliases: { [Intent.Next]: ['onward'] },
      matchThresholds: { coverage: 0.85, similarity: 0.75 },
    };
    expect(parseUpdateSettings(body)).toEqual(body);
  });

  it('T1: parseUpdateSettings rejects out-of-range and malformed values', () => {
    expect(
      issuesOf(() =>
        parseUpdateSettings({
          defaultRate: 5,
          theme: 'neon',
          reducedMotion: 'yes',
          commandAliases: { JUMP: ['go'] },
          matchThresholds: { coverage: 1.5 },
        }),
      ),
    ).toEqual([
      'defaultRate: must be a number from 0.5 to 2',
      'theme: must be one of: dark, light, system',
      'reducedMotion: must be a boolean',
      `commandAliases.JUMP: unknown intent; use one of: ${Object.values(Intent).join(', ')}`,
      'matchThresholds.coverage: must be a number from 0 to 1',
      'matchThresholds.similarity: must be a number from 0 to 1',
    ]);
  });

  it('T1: parseAddVoiceFavorite requires provider, voiceId and label', () => {
    expect(parseAddVoiceFavorite({ provider: 'kokoro', voiceId: 'af_heart', label: 'Heart' })).toEqual({
      provider: 'kokoro',
      voiceId: 'af_heart',
      label: 'Heart',
    });
    expect(issuesOf(() => parseAddVoiceFavorite({ provider: 'kokoro' }))).toEqual([
      'voiceId: must be a string',
      'label: must be a string',
    ]);
  });

  it('T1: bad JSON is a 400 validation error', () => {
    expect(() => parseJsonBody('{oops')).toThrow(ApiException);
    expect(parseJsonBody('')).toBeUndefined();
  });

  it('T1: unknown errors become a generic 500 ApiError', () => {
    expect(toApiError(new Error('secret detail'))).toEqual({
      statusCode: 500,
      code: ApiErrorCode.Internal,
      message: 'Something went wrong on the server.',
    });
  });
});
