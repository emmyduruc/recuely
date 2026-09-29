// The local AI service (apps/ai, SPEC.md §B5 `/v0`; implemented in Task 10b). Every response is validated
// against the shared contracts before use.
import {
  AiCapabilityStatus,
  ContractType,
  type ContractTypes,
  HealthStatus,
  type SpeechVoice,
  type SttTranscript,
  type TtsRequest,
  type TtsResult,
} from '@repo/contracts';
import { validateContract } from '@repo/contracts/validation';
import type { SpeechConfig } from './config';
import { SpeechFailure, SpeechFailureKind, failureForStatus } from './failure';

const AUDIO_PATH_PREFIX = '/v0/';

async function call(config: SpeechConfig, path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${config.aiServiceUrl}${path}`, { ...init, signal });
  } catch {
    throw new SpeechFailure(signal.aborted ? SpeechFailureKind.Timeout : SpeechFailureKind.Unavailable);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SpeechFailure(failureForStatus(response.status));
  }
  return response;
}

async function json<K extends ContractType>(type: K, response: Response): Promise<ContractTypes[K]> {
  const result = validateContract(type, await response.json().catch(() => null));
  if (!result.ok) throw new SpeechFailure(SpeechFailureKind.InvalidResponse);
  return result.value;
}

export async function localSynthesize(config: SpeechConfig, request: TtsRequest): Promise<TtsResult> {
  const response = await call(
    config,
    '/v0/tts',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) },
    config.localTimeoutMs,
  );
  return json(ContractType.TtsResult, response);
}

/** Streams a clip the local service synthesized. Only its own `/v0/…` paths are fetched (no open redirect). */
export async function localAudio(config: SpeechConfig, audioUrl: string): Promise<{ body: AsyncIterable<Uint8Array>; contentType: string }> {
  if (!audioUrl.startsWith(AUDIO_PATH_PREFIX)) throw new SpeechFailure(SpeechFailureKind.InvalidResponse);
  const response = await call(config, audioUrl, { method: 'GET' }, config.localTimeoutMs);
  if (response.body === null) throw new SpeechFailure(SpeechFailureKind.InvalidResponse);
  return { body: response.body, contentType: response.headers.get('content-type') ?? 'audio/wav' };
}

export interface EchoedIds {
  sessionId?: string;
  chunkId?: string;
  seq?: number;
}

export async function localTranscribe(config: SpeechConfig, audio: Buffer, contentType: string, ids: EchoedIds): Promise<SttTranscript> {
  const query = new URLSearchParams(
    Object.entries(ids).flatMap(([name, value]) => (value === undefined ? [] : [[name, String(value)]])),
  ).toString();
  const response = await call(
    config,
    `/v0/stt${query.length > 0 ? `?${query}` : ''}`,
    { method: 'POST', headers: { 'content-type': contentType }, body: new Uint8Array(audio) },
    config.localTimeoutMs,
  );
  return json(ContractType.SttTranscript, response);
}

/** Local voices, or none when the service is down (the voice list must not fail because of it). */
export async function localVoices(config: SpeechConfig): Promise<SpeechVoice[]> {
  try {
    const response = await call(config, '/v0/tts/voices', { method: 'GET' }, config.healthTimeoutMs);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return [];
    return body.flatMap((voice: unknown) => {
      const result = validateContract(ContractType.SpeechVoice, voice);
      return result.ok ? [result.value] : [];
    });
  } catch {
    return [];
  }
}

/** `ok` when TTS and STT are both available, `degraded` when one is, else `unavailable` (incl. unreachable). */
export async function localHealth(config: SpeechConfig): Promise<HealthStatus> {
  try {
    const response = await call(config, '/v0/health', { method: 'GET' }, config.healthTimeoutMs);
    const body = (await response.json()) as { capabilities?: Record<string, { status?: unknown } | undefined> };
    const up = [body.capabilities?.tts?.status, body.capabilities?.stt?.status].filter((status) => status === AiCapabilityStatus.Available).length;
    const BY_COUNT: Record<number, HealthStatus> = { 0: HealthStatus.Unavailable, 1: HealthStatus.Degraded, 2: HealthStatus.Ok };
    return BY_COUNT[up] ?? HealthStatus.Unavailable;
  } catch {
    return HealthStatus.Unavailable;
  }
}
