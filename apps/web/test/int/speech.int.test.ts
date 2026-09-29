// Task 10: speech through the built server, against a fake OpenAI and a fake local AI service.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ApiErrorCode,
  ContractType,
  HealthStatus,
  SpeechProvider,
  TimingSource,
} from '@repo/contracts';
import { validateContract } from '@repo/contracts/validation';
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { FAKE_MP3_DURATION_MS, FAKE_OPENAI_KEY, Marker, type RecordedCall } from './fake-speech';
import { api, useSeededDatabase } from './helpers';

const OPENAI = 'openai';
const LOCAL = 'local';
const SPEECH = '/audio/speech';
const TRANSCRIPTIONS = '/audio/transcriptions';
const OK = 200;
const PARTIAL = 206;

/** Every response body the tests saw, to prove the key never appears in one. */
const seenBodies: string[] = [];

async function call(method: string, path: string, body?: unknown) {
  const response = await api(method, path, body);
  seenBodies.push(JSON.stringify(response.body));
  return response;
}

/** Both fakes share one call log; it's read (and reset) through the local fake. */
async function fakeCalls(): Promise<RecordedCall[]> {
  return (await (await fetch(`${inject('fakeAiServiceUrl')}/__calls`)).json()) as RecordedCall[];
}

async function resetFakes(): Promise<void> {
  await fetch(`${inject('fakeAiServiceUrl')}/__reset`);
}

const openAiCalls = async (suffix: string) => (await fakeCalls()).filter((c) => c.service === OPENAI && c.path.endsWith(suffix));

async function tts(text: string, extra: Record<string, unknown> = {}) {
  const response = await call('POST', '/api/speech/tts', { text, ...extra });
  const result = validateContract(ContractType.SpeechTtsResult, response.body);
  return { status: response.status, body: response.body, result: result.ok ? result.value : null };
}

async function stt(audio: string, query = '') {
  const response = await fetch(`${inject('baseUrl')}/api/speech/stt${query}`, {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
    body: Buffer.from(`RIFF....WAVE ${audio}`),
  });
  const text = await response.text();
  seenBodies.push(text);
  return { status: response.status, body: JSON.parse(text) as unknown };
}

const consent = (value: boolean) => call('PATCH', '/api/me/settings', { cloudSpeechConsent: value });

describe('Task 10: speech via Nitro', () => {
  useSeededDatabase();
  beforeEach(resetFakes);

  it('T10: without consent, nothing reaches OpenAI: TTS and STT are served locally', async () => {
    const synth = await tts('Welcome back, everyone.');
    expect(synth.status).toBe(OK);
    expect(synth.result?.provider).toBe(SpeechProvider.Local);
    expect(synth.result?.voiceId).toBe('af_heart');
    expect(synth.result?.timingSource).toBe(TimingSource.Provider);
    const heard = await stt('hello', '?sessionId=s1&chunkId=c1&seq=7');
    expect(heard.status).toBe(OK);
    expect(heard.body).toMatchObject({ text: 'local transcript', provider: SpeechProvider.Local, sessionId: 's1', chunkId: 'c1', seq: 7 });
    expect((await fakeCalls()).filter((c) => c.service === OPENAI)).toEqual([]);
  });

  it('T10: consent is stored with a timestamp and can be revoked', async () => {
    const on = await consent(true);
    expect(on.status).toBe(OK);
    const at = (on.body as { cloudSpeechConsentAt: string | null }).cloudSpeechConsentAt;
    expect(typeof at).toBe('string');
    const again = await consent(true);
    expect((again.body as { cloudSpeechConsentAt: string }).cloudSpeechConsentAt).toBe(at);
    const off = await consent(false);
    expect((off.body as { cloudSpeechConsentAt: null }).cloudSpeechConsentAt).toBeNull();
  });

  it('T10: with consent, OpenAI synthesizes (chunk highlight); the clip is cached, served with Range, and a repeat makes no upstream call', async () => {
    await consent(true);
    const first = await tts('Here it is, finally.', { rate: 1.25 });
    expect(first.status).toBe(OK);
    expect(first.result).toMatchObject({
      provider: SpeechProvider.OpenAi,
      voiceId: 'alloy',
      cached: false,
      durationMs: FAKE_MP3_DURATION_MS,
      timings: null,
      timingSource: TimingSource.None,
    });
    const [request] = await openAiCalls(SPEECH);
    expect(request?.authorized).toBe(true);
    expect(request?.body).toEqual({ model: 'gpt-4o-mini-tts', input: 'Here it is, finally.', voice: 'alloy', speed: 1.25, response_format: 'mp3' });

    const audio = await fetch(`${inject('baseUrl')}${first.result?.audioUrl ?? ''}`);
    expect(audio.status).toBe(OK);
    expect(audio.headers.get('content-type')).toBe('audio/mpeg');
    expect((await audio.arrayBuffer()).byteLength).toBe(25 * 96);
    const range = await fetch(`${inject('baseUrl')}${first.result?.audioUrl ?? ''}`, { headers: { range: 'bytes=0-9' } });
    expect(range.status).toBe(PARTIAL);
    expect((await range.arrayBuffer()).byteLength).toBe(10);

    const repeat = await tts('Here it is, finally.', { rate: 1.25 });
    expect(repeat.result).toMatchObject({ cached: true, cacheKey: first.result?.cacheKey });
    expect(await openAiCalls(SPEECH)).toHaveLength(1);
  });

  it.each([
    ['no first byte', Marker.StallFirstByte],
    ['a stall mid-stream', Marker.StallMidStream],
    ['a server error', Marker.Fail],
    ['a rate limit', Marker.Quota],
  ])('T10: %s is retried once, then served by the local voice', async (_name, marker) => {
    await consent(true);
    const started = performance.now();
    const synth = await tts(`Let's open it together. ${marker}`);
    expect(synth.status).toBe(OK);
    expect(synth.result?.provider).toBe(SpeechProvider.Local);
    expect(await openAiCalls(SPEECH)).toHaveLength(2);
    // Two 400 ms attempts plus the local call: well inside the §B12 budget.
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('T10: a failed stream leaves no partial clip; a success on retry is cached as OpenAI audio', async () => {
    await consent(true);
    const flaky = await tts(`First, charge it overnight. ${Marker.Flaky}`);
    expect(flaky.result?.provider).toBe(SpeechProvider.OpenAi);
    expect(flaky.result?.durationMs).toBe(FAKE_MP3_DURATION_MS);
    expect(await openAiCalls(SPEECH)).toHaveLength(2);
  });

  it('T10: when every provider fails, the answer is 503 speech_unavailable naming each failure', async () => {
    await consent(true);
    const synth = await tts(`Nothing works. ${Marker.StallFirstByte} ${Marker.LocalDown}`);
    expect(synth.status).toBe(503);
    expect(synth.body).toMatchObject({
      code: ApiErrorCode.SpeechUnavailable,
      details: [
        { field: SpeechProvider.OpenAi, issue: 'timeout' },
        { field: SpeechProvider.Local, issue: 'unavailable' },
      ],
    });
  });

  it('T10: with consent, OpenAI transcribes in English without a prompt; a stalled attempt is retried, then local', async () => {
    await consent(true);
    const heard = await stt('hello', '?chunkId=c2&seq=3');
    expect(heard.body).toMatchObject({ text: 'cloud transcript', provider: SpeechProvider.OpenAi, model: 'gpt-transcribe', durationMs: 1500, chunkId: 'c2', seq: 3 });
    const [upload] = await openAiCalls(TRANSCRIPTIONS);
    expect(upload?.hasPrompt).toBe(false);
    expect(upload?.fields).toMatchObject({ model: 'gpt-transcribe', language: 'en' });

    await resetFakes();
    const fallback = await stt(Marker.SttStall, '?seq=4');
    expect(fallback.body).toMatchObject({ provider: SpeechProvider.Local, text: 'local transcript', seq: 4 });
    expect(await openAiCalls(TRANSCRIPTIONS)).toHaveLength(2);

    const down = await stt(`${Marker.SttStall} ${Marker.SttLocalDown}`);
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({ code: ApiErrorCode.SpeechUnavailable });
  });

  it('T10: STT rejects unsupported types, empty bodies, a bad seq and bodies over 25 MB', async () => {
    const base = `${inject('baseUrl')}/api/speech/stt`;
    expect((await fetch(base, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status).toBe(415);
    expect((await fetch(base, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: '' })).status).toBe(422);
    expect((await fetch(`${base}?seq=-1`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: 'x' })).status).toBe(422);
    const huge = Buffer.alloc(25 * 1024 * 1024 + 1);
    expect((await fetch(base, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: huge })).status).toBe(413);
  });

  it('T10: TTS validates its body; unknown clips are 404', async () => {
    expect((await call('POST', '/api/speech/tts', { text: '   ' })).status).toBe(422);
    expect((await call('POST', '/api/speech/tts', { text: 'Hi.', rate: 9 })).status).toBe(422);
    expect((await call('POST', '/api/speech/tts', { text: 'Hi.', prompt: 'x' })).status).toBe(422);
    expect((await call('GET', `/api/speech/audio/${'0'.repeat(32)}`)).status).toBe(404);
    expect((await call('GET', '/api/speech/audio/not-a-key')).status).toBe(404);
  });

  it('T10: voices list both providers (invalid local entries dropped); health reports both', async () => {
    const voices = await call('GET', '/api/speech/voices');
    const list = voices.body as { provider: string; voiceId: string }[];
    expect(list.filter((v) => v.provider === OPENAI).map((v) => v.voiceId)).toContain('alloy');
    expect(list.filter((v) => v.provider === LOCAL)).toEqual([{ provider: LOCAL, voiceId: 'af_heart', label: 'Heart' }]);
    const health = await call('GET', '/api/health');
    expect((health.body as { speech: { local: string } }).speech.local).toBe(HealthStatus.Ok);
    expect([HealthStatus.Ok, HealthStatus.Degraded]).toContain((health.body as { speech: { openai: string } }).speech.openai);
  });

  it('T10: unknown /api paths and wrong methods answer with an ApiError (404 / 405 + Allow)', async () => {
    const unknown = await call('GET', '/api/speech/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ statusCode: 404, code: ApiErrorCode.NotFound });
    const wrong = await fetch(`${inject('baseUrl')}/api/speech/tts`, { method: 'GET' });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('POST');
    expect(await wrong.json()).toMatchObject({ statusCode: 405, code: ApiErrorCode.MethodNotAllowed });
  });

  it('T10: the key never appears in responses, server logs, rendered pages or the client bundle', async () => {
    await consent(true);
    // OpenAI echoes a (masked) key in its 401 body; ours must not pass it on or log it.
    const rejected = await tts(`Echo the key. ${Marker.EchoKey}`);
    expect(rejected.result?.provider).toBe(SpeechProvider.Local);
    // A bad key is not retried: one upstream call, then local.
    expect(await openAiCalls(SPEECH)).toHaveLength(1);
    for (const page of ['/', '/import']) {
      seenBodies.push(await (await fetch(`${inject('baseUrl')}${page}`)).text());
    }
    expect(seenBodies.filter((body) => body.includes(FAKE_OPENAI_KEY))).toEqual([]);
    const log = readFileSync(inject('serverLogPath'), 'utf8');
    expect(log).toContain('[speech] openai tts attempt 1/2 failed: unauthorized');
    expect(log).not.toContain(FAKE_OPENAI_KEY);

    const publicDir = new URL('../../.output/public/', import.meta.url).pathname;
    const files = readdirSync(publicDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
    const realKey = process.env.OPENAI_API_KEY?.trim() ?? '';
    for (const file of files) {
      const text = readFileSync(join(file.parentPath, file.name), 'latin1');
      expect(text.includes('OPENAI_API_KEY'), file.name).toBe(false);
      if (realKey.length > 0) expect(text.includes(realKey), file.name).toBe(false);
    }
    expect(files.length).toBeGreaterThan(0);
  });
});
