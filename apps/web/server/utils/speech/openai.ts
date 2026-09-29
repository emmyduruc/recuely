// OpenAI speech over plain fetch (SPEC.md §B12, §B8: no SDK). TTS `gpt-4o-mini-tts` mp3 streamed; STT
// `gpt-transcribe`, never prompted with the chunk text (Task 8 finding H-15).
import type { SpeechConfig } from './config';
import { SpeechFailure, SpeechFailureKind, failureForStatus } from './failure';
import { guardedStream, StreamDeadlineError, StreamFailure } from './guarded-stream';

export const OPENAI_TTS_FORMAT = 'mp3';
export const OPENAI_TTS_CONTENT_TYPE = 'audio/mpeg';
const STT_LANGUAGE = 'en';

const STREAM_FAILURE_KIND: Record<StreamFailure, SpeechFailureKind> = {
  [StreamFailure.FirstByteTimeout]: SpeechFailureKind.Timeout,
  [StreamFailure.Stalled]: SpeechFailureKind.Stalled,
};

function requireKey(config: SpeechConfig): string {
  if (config.openAiKey === null) throw new SpeechFailure(SpeechFailureKind.NotAllowed);
  return config.openAiKey;
}

/** Re-throws deadline errors from the body stream as speech failures (so retry logic sees one error type). */
async function* translated(stream: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  try {
    yield* stream;
  } catch (error) {
    if (error instanceof StreamDeadlineError) throw new SpeechFailure(STREAM_FAILURE_KIND[error.failure]);
    throw error;
  }
}

export interface OpenAiSpeechRequest {
  text: string;
  voiceId: string;
  rate: number;
}

/**
 * Starts synthesis and returns the audio as a guarded stream: the first byte must arrive within
 * `ttsFirstByteMs` of the request, and no gap may exceed `ttsStallMs`. Consumers stream it straight to storage.
 */
export async function openAiSpeech(config: SpeechConfig, request: OpenAiSpeechRequest): Promise<AsyncIterable<Uint8Array>> {
  const key = requireKey(config);
  const controller = new AbortController();
  const startedAt = performance.now();
  const headersDeadline = setTimeout(() => {
    controller.abort();
  }, config.ttsFirstByteMs);
  let response: Response;
  try {
    response = await fetch(`${config.openAiBaseUrl}/audio/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.ttsModel,
        input: request.text,
        voice: request.voiceId,
        speed: request.rate,
        response_format: OPENAI_TTS_FORMAT,
      }),
      signal: controller.signal,
    });
  } catch {
    throw new SpeechFailure(controller.signal.aborted ? SpeechFailureKind.Timeout : SpeechFailureKind.Unavailable);
  } finally {
    clearTimeout(headersDeadline);
  }
  if (!response.ok || response.body === null) {
    await response.body?.cancel().catch(() => undefined);
    throw new SpeechFailure(response.ok ? SpeechFailureKind.InvalidResponse : failureForStatus(response.status));
  }
  const deadlines = { firstByteMs: config.ttsFirstByteMs, stallMs: config.ttsStallMs };
  return translated(
    guardedStream(response.body, deadlines, startedAt, () => {
      controller.abort();
    }),
  );
}

export interface OpenAiTranscript {
  text: string;
  durationMs: number;
}

interface TranscriptionBody {
  text?: unknown;
  usage?: { seconds?: unknown };
}

/** One transcription attempt, bounded by `sttTimeoutMs` end to end. */
export async function openAiTranscribe(
  config: SpeechConfig,
  audio: Buffer,
  contentType: string,
  filename: string,
): Promise<OpenAiTranscript> {
  const key = requireKey(config);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: contentType }), filename);
  form.append('model', config.sttModel);
  form.append('language', STT_LANGUAGE);
  form.append('response_format', 'json');
  const signal = AbortSignal.timeout(config.sttTimeoutMs);
  let response: Response;
  let body: TranscriptionBody;
  try {
    response = await fetch(`${config.openAiBaseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new SpeechFailure(failureForStatus(response.status));
    }
    body = (await response.json()) as TranscriptionBody;
  } catch (error) {
    if (error instanceof SpeechFailure) throw error;
    throw new SpeechFailure(signal.aborted ? SpeechFailureKind.Timeout : SpeechFailureKind.Unavailable);
  }
  if (typeof body.text !== 'string') throw new SpeechFailure(SpeechFailureKind.InvalidResponse);
  const seconds = typeof body.usage?.seconds === 'number' ? body.usage.seconds : 0;
  return { text: body.text.trim(), durationMs: Math.round(seconds * 1000) };
}
