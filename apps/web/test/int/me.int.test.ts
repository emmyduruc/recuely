import { ApiErrorCode, Locale, LOCAL_USER_DISPLAY_NAME } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { api, useSeededDatabase } from './helpers';

useSeededDatabase();

describe('/api/me', () => {
  it('T1: GET returns the seeded local user', async () => {
    const { status, body } = await api('GET', '/api/me');
    expect(status).toBe(200);
    expect(body).toMatchObject({ displayName: LOCAL_USER_DISPLAY_NAME, locale: Locale.En, isLocal: true, email: null });
  });

  it('T1: PATCH persists valid fields', async () => {
    const patch = await api('PATCH', '/api/me', { displayName: 'Ada', email: 'ada@example.com' });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ displayName: 'Ada', email: 'ada@example.com' });
    expect((await api('GET', '/api/me')).body).toMatchObject({ displayName: 'Ada', email: 'ada@example.com' });
  });

  it('T1: PATCH rejects an unsupported locale with a 422 ApiError', async () => {
    const { status, body } = await api('PATCH', '/api/me', { locale: 'de' });
    expect(status).toBe(422);
    expect(body).toEqual({
      statusCode: 422,
      code: ApiErrorCode.ValidationFailed,
      message: 'The request body is invalid.',
      details: [{ field: 'locale', issue: 'must be one of: en' }],
    });
  });

  it('T1: PATCH with malformed JSON is a 400 ApiError', async () => {
    const { status, body } = await api('PATCH', '/api/me', '{oops');
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: ApiErrorCode.ValidationFailed });
  });
});
