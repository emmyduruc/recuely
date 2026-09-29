// Speech orchestration (SPEC.md §B12): provider choice, cache, per-attempt deadlines with one OpenAI retry,
// then the local fallback. Nothing reaches OpenAI without the user's consent.
import {
  ApiErrorCode,
  type ApiErrorDetail,
  HealthStatus,
  SpeechProvider,
  type SpeechSttResult,
  type SpeechTtsResult,
  type Storage,
  TimingSource,
  type TtsRequest,
} from '@repo/contracts';
import { ApiException, HttpStatus } from '../api-error';
import { type ClipMeta, readClipAudio, readClipMeta, storeClipAudio, storeClipMeta, ttsCacheKey } from './cache';
import type { SpeechConfig } from './config';
import { failureKindOf, isTransient } from './failure';
import { type EchoedIds, localAudio, localSynthesize, localTranscribe } from './local';
import { mp3DurationMs } from './mp3';
import { OPENAI_TTS_CONTENT_TYPE, openAiSpeech, openAiTranscribe } from './openai';
import { resolveVoice } from './voices';

/** OpenAI attempts per request: the first plus one retry (Task 10a: 15% of TTS requests stalled). */
export const OPENAI_ATTEMPTS = 2;
const LOCAL_TTS_MODEL = 'local-tts';

export interface SpeechUserSettings {
  cloudSpeechConsentAt: Date | null;
  defaultVoiceId: string | null;
  defaultRate: number;
}

export interface SpeechContext {
  config: SpeechConfig;
  storage: Storage;
  settings: SpeechUserSettings;
}

/** OpenAI first only with consent and a key; the local service is always the fallback (§A6.8). */
export function chooseProviders(consented: boolean, keyConfigured: boolean): SpeechProvider[] {
  return consented && keyConfigured ? [SpeechProvider.OpenAi, SpeechProvider.Local] : [SpeechProvider.Local];
}

const providersFor = (ctx: SpeechContext): SpeechProvider[] =>
  chooseProviders(ctx.settings.cloudSpeechConsentAt !== null, ctx.config.openAiKey !== null);

// Health of the OpenAI path, from real requests only (health checks never call OpenAI; §A6.8).
const RECENT_FAILURE_MS = 60_000;
let lastOpenAiFailureAt: number | null = null;

function noteOpenAi(ok: boolean): void {
  lastOpenAiFailureAt = ok ? null : Date.now();
}

export function openAiHealth(config: SpeechConfig): HealthStatus {
  if (config.openAiKey === null) return HealthStatus.Unavailable;
  return lastOpenAiFailureAt !== null && Date.now() - lastOpenAiFailureAt < RECENT_FAILURE_MS ? HealthStatus.Degraded : HealthStatus.Ok;
}

/**
 * Runs `attempt` up to `times`; only transient failures are retried. Each failure is logged by kind only
 * (never upstream bodies, which can echo a masked key).
 */
export async function withRetry<T>(label: string, times: number, attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n += 1) {
    try {
      return await attempt();
    } catch (error) {
      const kind = failureKindOf(error);
      console.warn(`[speech] ${label} attempt ${String(n)}/${String(times)} failed: ${kind}`);
      if (n >= times || !isTransient(kind)) throw error;
    }
  }
}

function unavailable(what: string, failures: ApiErrorDetail[]): ApiException {
  return new ApiException(HttpStatus.ServiceUnavailable, ApiErrorCode.SpeechUnavailable, `No speech provider could ${what}.`, failures);
}

interface Clip {
  key: string;
  identity: { voiceId: string; rate: number; text: string };
}

type Synthesizer = (ctx: SpeechContext, clip: Clip) => Promise<ClipMeta>;

const SYNTHESIZE: Record<SpeechProvider, Synthesizer> = {
  [SpeechProvider.OpenAi]: async (ctx, { key, identity }) => {
    await withRetry('openai tts', OPENAI_ATTEMPTS, async () => {
      const audio = await openAiSpeech(ctx.config, identity);
      await storeClipAudio(ctx.storage, key, audio);
    });
    const durationMs = mp3DurationMs(await readClipAudio(ctx.storage, key)) ?? 0;
    // The cloud voice has no trustworthy word timings (H-29 refuted): chunk highlight (§B12).
    return {
      provider: SpeechProvider.OpenAi,
      voiceId: identity.voiceId,
      contentType: OPENAI_TTS_CONTENT_TYPE,
      durationMs,
      timings: null,
      timingSource: TimingSource.None,
    };
  },
  [SpeechProvider.Local]: async (ctx, { key, identity }) => {
    const result = await withRetry('local tts', 1, () => localSynthesize(ctx.config, identity));
    const audio = await localAudio(ctx.config, result.audioUrl);
    await storeClipAudio(ctx.storage, key, audio.body);
    return {
      provider: SpeechProvider.Local,
      voiceId: identity.voiceId,
      contentType: audio.contentType,
      durationMs: result.durationMs,
      timings: result.timings,
      timingSource: result.timingSource,
    };
  },
};

const MODEL_OF: Record<SpeechProvider, (config: SpeechConfig) => string> = {
  [SpeechProvider.OpenAi]: (config) => config.ttsModel,
  [SpeechProvider.Local]: () => LOCAL_TTS_MODEL,
};

function toResult(key: string, meta: ClipMeta, cached: boolean): SpeechTtsResult {
  return {
    audioUrl: `/api/speech/audio/${key}`,
    durationMs: meta.durationMs,
    timings: meta.timings,
    timingSource: meta.timingSource,
    cacheKey: key,
    provider: meta.provider,
    voiceId: meta.voiceId,
    cached,
  };
}

/** Audio for one chunk: from the cache, else from the first provider that succeeds. */
export async function synthesize(ctx: SpeechContext, request: TtsRequest): Promise<SpeechTtsResult> {
  const failures: ApiErrorDetail[] = [];
  const rate = request.rate ?? ctx.settings.defaultRate;
  for (const provider of providersFor(ctx)) {
    const voiceId = resolveVoice[provider](request.voiceId ?? ctx.settings.defaultVoiceId);
    const identity = { voiceId, rate, text: request.text };
    const key = ttsCacheKey({ provider, model: MODEL_OF[provider](ctx.config), ...identity });
    const hit = await readClipMeta(ctx.storage, key);
    if (hit !== null) return toResult(key, hit, true);
    try {
      const meta = await SYNTHESIZE[provider](ctx, { key, identity });
      await storeClipMeta(ctx.storage, key, meta);
      if (provider === SpeechProvider.OpenAi) noteOpenAi(true);
      return toResult(key, meta, false);
    } catch (error) {
      if (provider === SpeechProvider.OpenAi) noteOpenAi(false);
      failures.push({ field: provider, issue: failureKindOf(error) });
    }
  }
  throw unavailable('synthesize this text', failures);
}

export interface TakeAudio {
  bytes: Buffer;
  contentType: string;
  filename: string;
  ids: EchoedIds;
}

type Transcriber = (ctx: SpeechContext, audio: TakeAudio) => Promise<SpeechSttResult>;

const TRANSCRIBE: Record<SpeechProvider, Transcriber> = {
  [SpeechProvider.OpenAi]: async (ctx, audio) => {
    const transcript = await withRetry('openai stt', OPENAI_ATTEMPTS, () =>
      openAiTranscribe(ctx.config, audio.bytes, audio.contentType, audio.filename),
    );
    return { ...transcript, model: ctx.config.sttModel, ...audio.ids, provider: SpeechProvider.OpenAi };
  },
  [SpeechProvider.Local]: async (ctx, audio) => {
    const transcript = await withRetry('local stt', 1, () => localTranscribe(ctx.config, audio.bytes, audio.contentType, audio.ids));
    // The request ids are echoed from our side, whatever the service returned.
    return { ...transcript, ...audio.ids, provider: SpeechProvider.Local };
  },
};

/** Transcript of one take from the first provider that succeeds. */
export async function transcribe(ctx: SpeechContext, audio: TakeAudio): Promise<SpeechSttResult> {
  const failures: ApiErrorDetail[] = [];
  for (const provider of providersFor(ctx)) {
    try {
      const result = await TRANSCRIBE[provider](ctx, audio);
      if (provider === SpeechProvider.OpenAi) noteOpenAi(true);
      return result;
    } catch (error) {
      if (provider === SpeechProvider.OpenAi) noteOpenAi(false);
      failures.push({ field: provider, issue: failureKindOf(error) });
    }
  }
  throw unavailable('transcribe this take', failures);
}

