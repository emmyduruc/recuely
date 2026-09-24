import { ApiErrorCode, DEFAULT_MATCH_THRESHOLDS, Intent, Theme } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { api, useSeededDatabase } from './helpers';

useSeededDatabase();

describe('/api/me/settings', () => {
  it('T1: GET returns the defaults after seeding', async () => {
    const { status, body } = await api('GET', '/api/me/settings');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      defaultVoiceId: null,
      defaultRate: 1,
      theme: Theme.Dark,
      reducedMotion: false,
      commandAliases: {},
      matchThresholds: DEFAULT_MATCH_THRESHOLDS,
    });
  });

  it('T1: PATCH persists valid values and leaves the rest alone', async () => {
    const patch = {
      defaultRate: 0.9,
      theme: Theme.Light,
      commandAliases: { [Intent.Next]: ['onward'] },
      matchThresholds: { coverage: 0.85, similarity: 0.75 },
    };
    expect((await api('PATCH', '/api/me/settings', patch)).status).toBe(200);
    const { body } = await api('GET', '/api/me/settings');
    expect(body).toMatchObject({ ...patch, reducedMotion: false, defaultVoiceId: null });
  });

  it('T1: PATCH rejects invalid values with a 422 ApiError and changes nothing', async () => {
    const { status, body } = await api('PATCH', '/api/me/settings', { defaultRate: 5, theme: 'neon', extra: 1 });
    expect(status).toBe(422);
    expect(body).toEqual({
      statusCode: 422,
      code: ApiErrorCode.ValidationFailed,
      message: 'The request body is invalid.',
      details: [
        { field: 'extra', issue: 'unknown field' },
        { field: 'defaultRate', issue: 'must be at most 2' },
        { field: 'theme', issue: 'must be one of: dark, light, system' },
      ],
    });
    expect((await api('GET', '/api/me/settings')).body).toMatchObject({ defaultRate: 1, theme: Theme.Dark });
  });
});
