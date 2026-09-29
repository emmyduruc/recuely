// TTS audio cache in `Storage` (SPEC.md §B12): write-once objects under `speech/`, keyed by everything that
// changes the audio, so repeats and retakes cost nothing and start instantly.
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  isValueOf,
  type SpeechProvider,
  SpeechProvider as Providers,
  type Storage,
  StorageError,
  StorageErrorCode,
  TimingSource,
  type WordTiming,
} from '@repo/contracts';

export const CACHE_KEY_PATTERN = /^[a-f0-9]{32}$/;

/** Object bytes allowed per cached clip (a 4,096-character chunk is a few MB at most). */
export const MAX_CLIP_BYTES = 20 * 1024 * 1024;

export interface CacheIdentity {
  provider: SpeechProvider;
  model: string;
  voiceId: string;
  rate: number;
  text: string;
}

/** Stable key for one synthesis: any change to provider, model, voice, rate or text is a different clip. */
export function ttsCacheKey(identity: CacheIdentity): string {
  const material = JSON.stringify([identity.provider, identity.model, identity.voiceId, identity.rate, identity.text]);
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

export interface ClipMeta {
  provider: SpeechProvider;
  voiceId: string;
  contentType: string;
  durationMs: number;
  timings: WordTiming[] | null;
  timingSource: TimingSource;
}

export const audioObjectKey = (key: string): string => `speech/${key}.audio`;
const metaObjectKey = (key: string): string => `speech/${key}.json`;

async function readAll(storage: Storage, key: string): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const part of storage.read(key)) parts.push(part);
  return Buffer.concat(parts);
}

function isClipMeta(value: unknown): value is ClipMeta {
  if (typeof value !== 'object' || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    isValueOf(Providers, meta.provider) &&
    typeof meta.voiceId === 'string' &&
    typeof meta.contentType === 'string' &&
    typeof meta.durationMs === 'number' &&
    isValueOf(TimingSource, meta.timingSource) &&
    (meta.timings === null || Array.isArray(meta.timings))
  );
}

/** The cached clip's metadata, or null. A clip counts as cached only once its metadata exists. */
export async function readClipMeta(storage: Storage, key: string): Promise<ClipMeta | null> {
  if ((await storage.stat(metaObjectKey(key))) === null || (await storage.stat(audioObjectKey(key))) === null) return null;
  const parsed: unknown = JSON.parse((await readAll(storage, metaObjectKey(key))).toString('utf8'));
  return isClipMeta(parsed) ? parsed : null;
}

/** Write-once put that treats "already there" as success: a concurrent identical request won the race. */
async function putOnce(storage: Storage, key: string, body: AsyncIterable<Uint8Array>): Promise<void> {
  try {
    await storage.put(key, body, { maxBytes: MAX_CLIP_BYTES });
  } catch (error) {
    if (!(error instanceof StorageError && error.code === StorageErrorCode.AlreadyExists)) throw error;
  }
}

export async function storeClipAudio(storage: Storage, key: string, body: AsyncIterable<Uint8Array>): Promise<void> {
  await putOnce(storage, audioObjectKey(key), body);
}

export async function readClipAudio(storage: Storage, key: string): Promise<Buffer> {
  return readAll(storage, audioObjectKey(key));
}

export async function storeClipMeta(storage: Storage, key: string, meta: ClipMeta): Promise<void> {
  await putOnce(storage, metaObjectKey(key), Readable.from([Buffer.from(JSON.stringify(meta), 'utf8')]));
}
