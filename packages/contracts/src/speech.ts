// Speech providers (SPEC.md §B12, Task 10). The web API and the local AI service share these shapes.
import type { HealthStatus } from './health.ts';
import type { TtsResult } from './payloads.ts';

/** Who synthesized or transcribed: OpenAI through Nitro (after consent) or the local AI service. */
export const SpeechProvider = {
  OpenAi: 'openai',
  Local: 'local',
} as const;
export type SpeechProvider = (typeof SpeechProvider)[keyof typeof SpeechProvider];

export const SpeechLimits = {
  /** OpenAI's speech input limit (characters); chunks are far shorter. */
  textMax: 4096,
  voiceIdMax: 100,
  /** OpenAI's transcription upload limit. */
  audioBytesMax: 25 * 1024 * 1024,
} as const;

/** `POST /api/speech/tts` and `POST /v0/tts` body. Missing fields fall back to the user's settings / defaults. */
export interface TtsRequest {
  text: string;
  voiceId?: string;
  rate?: number;
}

/** The web API's synthesis result: the audio is always served by Nitro (`/api/speech/audio/:key`). */
export interface SpeechTtsResult extends TtsResult {
  provider: SpeechProvider;
  voiceId: string;
  /** True when served from the cache without an upstream call. */
  cached: boolean;
}

/** `POST /v0/stt` result (local AI service). Request ids are echoed so stale results can be dropped (§B6). */
export interface SttTranscript {
  text: string;
  durationMs: number;
  model: string;
  sessionId?: string;
  chunkId?: string;
  seq?: number;
}

export interface SpeechSttResult extends SttTranscript {
  provider: SpeechProvider;
}

export interface SpeechVoice {
  provider: SpeechProvider;
  voiceId: string;
  label: string;
}

/** `GET /api/health` → `speech`. */
export interface SpeechHealth {
  openai: HealthStatus;
  local: HealthStatus;
}
