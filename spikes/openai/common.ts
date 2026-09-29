// Task 10a spike (throwaway): shared helpers. The key is read from the repo-root .env and never printed.
import { mkdirSync, writeFileSync } from 'node:fs';

process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
const KEY = process.env.OPENAI_API_KEY ?? '';
if (KEY.length === 0) throw new Error('OPENAI_API_KEY is not set in .env');

export const API = 'https://api.openai.com/v1';
/** A spike request that takes longer than this counts as a failure (the app's TTS timeout is 4 s, §B7). */
export const REQUEST_TIMEOUT_MS = 30_000;
export const auth = { authorization: `Bearer ${KEY}` };

export const TEXTS: Record<string, string> = {
  short: 'Welcome back to the channel, everyone.',
  medium: 'Today, we are going to build a small wooden shelf that fits anywhere.',
  long: 'It fits in any corner of your room, holds all of your favourite books, and you can build it step by step with only three simple tools.',
};

/** Task 7's mapping lines (incl. E1) plus the three latency texts: the chunks whose word timings we derive. */
export const ALIGN_LINES: string[] = [
  "Welcome back, everyone. Today we're launching something new.",
  "It's small, light, and fast. Dr. Smith designed it — with care.",
  'Here it is, finally.',
  "Let's open it together.",
  'First, charge it overnight.',
  'Use 3 screws, 2 brackets and 1.5 metres of wood.',
  'We start at 10:30, e.g. right after lunch, in the U.S. office.',
  'The well-known résumé trick costs $20 — or 15% less.',
  'Hi there 👋 and welcome to part 2!',
  "It's the 21st time we've done this, and it won't be the last.",
  'Welcome back, everyone. Today we build a shelf. It takes one hour, and three tools.',
  ...Object.values(TEXTS),
];

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};
export const round = (value: number, digits = 3): number => Math.round(value * 10 ** digits) / 10 ** digits;

export function save(name: string, data: unknown): void {
  mkdirSync(new URL('results/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`results/${name}`, import.meta.url), JSON.stringify(data, null, 1));
}

export interface SpeechRequest {
  model: string;
  input: string;
  voice: string;
  response_format: 'mp3' | 'wav' | 'pcm' | 'opus';
  speed?: number;
}

/** POST /audio/speech; returns time to first body byte, total time and the audio. */
export async function speech(body: SpeechRequest): Promise<{ ttfb: number; total: number; audio: Buffer; status: number; error?: string }> {
  const started = performance.now();
  let response: Response;
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API}/audio/speech`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    return { ttfb: 0, total: (performance.now() - started) / 1000, audio: Buffer.alloc(0), status: 0, error: `request failed: ${String(error)}` };
  }
  if (!response.ok || response.body === null) {
    return { ttfb: 0, total: 0, audio: Buffer.alloc(0), status: response.status, error: await response.text() };
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let ttfb = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (parts.length === 0) ttfb = (performance.now() - started) / 1000;
      parts.push(value);
    }
  } catch (error) {
    return { ttfb, total: (performance.now() - started) / 1000, audio: Buffer.alloc(0), status: 0, error: `body failed: ${String(error)}` };
  }
  return { ttfb, total: (performance.now() - started) / 1000, audio: Buffer.concat(parts), status: response.status };
}

/** Duration of a 16-bit PCM WAV (reads the fmt/data chunks; OpenAI's WAV may use a streaming size). */
export function wavInfo(wav: Buffer): { sampleRate: number; channels: number; seconds: number; dataOffset: number } {
  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = wav.readUInt16LE(offset + 10);
      sampleRate = wav.readUInt32LE(offset + 12);
    }
    if (id === 'data') {
      const dataBytes = Math.min(size, wav.length - offset - 8);
      return { sampleRate, channels, seconds: dataBytes / 2 / channels / sampleRate, dataOffset: offset + 8 };
    }
    offset += 8 + size;
  }
  throw new Error('no data chunk');
}
