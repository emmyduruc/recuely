import { ApiErrorCode } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { api, useSeededDatabase } from './helpers';

useSeededDatabase();

const heart = { provider: 'kokoro', voiceId: 'af_heart', label: 'Heart' };

function idOf(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string') {
    return body.id;
  }
  throw new Error('response has no id');
}

describe('/api/me/voices', () => {
  it('T1: POST adds a favorite (201) and GET lists it', async () => {
    const created = await api('POST', '/api/me/voices', heart);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject(heart);
    const list = await api('GET', '/api/me/voices');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([created.body]);
  });

  it('T1: POST of the same voice again is a 409 ApiError', async () => {
    await api('POST', '/api/me/voices', heart);
    const { status, body } = await api('POST', '/api/me/voices', { ...heart, label: 'Again' });
    expect(status).toBe(409);
    expect(body).toMatchObject({ statusCode: 409, code: ApiErrorCode.Conflict });
  });

  it('T1: POST with missing fields is a 422 ApiError', async () => {
    const { status, body } = await api('POST', '/api/me/voices', { provider: 'kokoro' });
    expect(status).toBe(422);
    expect(body).toMatchObject({ code: ApiErrorCode.ValidationFailed });
  });

  it('T1: DELETE removes a favorite (204); a second DELETE and a malformed id are 404', async () => {
    const id = idOf((await api('POST', '/api/me/voices', heart)).body);
    expect((await api('DELETE', `/api/me/voices/${id}`)).status).toBe(204);
    expect((await api('GET', '/api/me/voices')).body).toEqual([]);
    const again = await api('DELETE', `/api/me/voices/${id}`);
    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ code: ApiErrorCode.NotFound });
    expect((await api('DELETE', '/api/me/voices/not-a-uuid')).status).toBe(404);
  });
});
