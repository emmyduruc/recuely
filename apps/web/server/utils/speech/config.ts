// Speech configuration from the server environment (SPEC.md §B12). The key never leaves this module except in
// the Authorization header of requests to OpenAI; it is not part of runtimeConfig, so it can't reach the client.

export interface SpeechConfig {
  openAiKey: string | null;
  openAiBaseUrl: string;
  ttsModel: string;
  sttModel: string;
  aiServiceUrl: string;
  /** Per OpenAI attempt (Task 10a): first TTS byte, gap during the stream, whole STT request. */
  ttsFirstByteMs: number;
  ttsStallMs: number;
  sttTimeoutMs: number;
  /** Local AI service requests (it may synthesize long chunks on CPU). */
  localTimeoutMs: number;
  /** `/v0/health` probe for `/api/health` (§B7 health timeout). */
  healthTimeoutMs: number;
}

export const SPEECH_DEFAULTS = {
  openAiBaseUrl: 'https://api.openai.com/v1',
  ttsModel: 'gpt-4o-mini-tts',
  sttModel: 'gpt-transcribe',
  aiServiceUrl: 'http://127.0.0.1:8008',
  ttsFirstByteMs: 2000,
  ttsStallMs: 2000,
  sttTimeoutMs: 4000,
  localTimeoutMs: 10_000,
  healthTimeoutMs: 1000,
} as const;

function trimmed(value: string | undefined): string | null {
  const text = value?.trim() ?? '';
  return text.length === 0 ? null : text;
}

function positiveMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export function readSpeechConfig(env: Readonly<Partial<Record<string, string>>>): SpeechConfig {
  return {
    openAiKey: trimmed(env.OPENAI_API_KEY),
    openAiBaseUrl: withoutTrailingSlash(trimmed(env.OPENAI_BASE_URL) ?? SPEECH_DEFAULTS.openAiBaseUrl),
    ttsModel: trimmed(env.OPENAI_TTS_MODEL) ?? SPEECH_DEFAULTS.ttsModel,
    sttModel: trimmed(env.OPENAI_STT_MODEL) ?? SPEECH_DEFAULTS.sttModel,
    aiServiceUrl: withoutTrailingSlash(trimmed(env.AI_SERVICE_URL) ?? SPEECH_DEFAULTS.aiServiceUrl),
    ttsFirstByteMs: positiveMs(env.SPEECH_TTS_FIRST_BYTE_MS, SPEECH_DEFAULTS.ttsFirstByteMs),
    ttsStallMs: positiveMs(env.SPEECH_TTS_STALL_MS, SPEECH_DEFAULTS.ttsStallMs),
    sttTimeoutMs: positiveMs(env.SPEECH_STT_TIMEOUT_MS, SPEECH_DEFAULTS.sttTimeoutMs),
    localTimeoutMs: positiveMs(env.SPEECH_LOCAL_TIMEOUT_MS, SPEECH_DEFAULTS.localTimeoutMs),
    healthTimeoutMs: SPEECH_DEFAULTS.healthTimeoutMs,
  };
}

let cached: SpeechConfig | undefined;

export function useSpeechConfig(): SpeechConfig {
  cached ??= readSpeechConfig(process.env);
  return cached;
}
