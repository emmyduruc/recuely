import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { MediaType, StorageError, StorageErrorCode } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { baseMediaType, mediaKey, parseRange, RangeKind } from '../server/utils/media';
import { LocalDiskStorage } from '../server/utils/storage';

function chunks(...parts: string[]): AsyncIterable<Uint8Array> {
  return Readable.from(parts.map((part) => new TextEncoder().encode(part)));
}

async function readAll(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const part of stream) {
    text += decoder.decode(part, { stream: true });
  }
  return text + decoder.decode();
}

async function failure(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('media helpers', () => {
  it('T4: base media types ignore codec parameters and reject other containers', () => {
    expect(baseMediaType('video/webm;codecs=vp9,opus')).toBe(MediaType.VideoWebm);
    expect(baseMediaType(' Audio/MP4 ')).toBe(MediaType.AudioMp4);
    expect(baseMediaType('video/avi')).toBeNull();
    expect(mediaKey('s1', 't1', MediaType.AudioMp4)).toBe('takes/s1/t1.m4a');
  });

  it('T4: Range parsing supports one range; anything else serves the whole file', () => {
    expect(parseRange(undefined, 100)).toEqual({ kind: RangeKind.Full });
    expect(parseRange('bytes=0-9', 100)).toEqual({ kind: RangeKind.Partial, range: { start: 0, end: 9 } });
    expect(parseRange('bytes=90-', 100)).toEqual({ kind: RangeKind.Partial, range: { start: 90, end: 99 } });
    expect(parseRange('bytes=-10', 100)).toEqual({ kind: RangeKind.Partial, range: { start: 90, end: 99 } });
    expect(parseRange('bytes=50-500', 100)).toEqual({ kind: RangeKind.Partial, range: { start: 50, end: 99 } });
    expect(parseRange('bytes=0-1,5-9', 100)).toEqual({ kind: RangeKind.Full });
    expect(parseRange('items=0-1', 100)).toEqual({ kind: RangeKind.Full });
    expect(parseRange('bytes=100-', 100)).toEqual({ kind: RangeKind.Unsatisfiable });
    expect(parseRange('bytes=9-2', 100)).toEqual({ kind: RangeKind.Unsatisfiable });
  });
});

describe('LocalDiskStorage', () => {
  const root = (): string => mkdtempSync(join(tmpdir(), 'storage-'));

  it('T4: streams an object in and back out, whole or by range', async () => {
    const storage = new LocalDiskStorage(root());
    expect(await storage.put('takes/s/t.webm', chunks('hello ', 'world'), { maxBytes: 100 })).toEqual({ bytes: 11 });
    expect(await storage.stat('takes/s/t.webm')).toEqual({ bytes: 11 });
    expect(await readAll(storage.read('takes/s/t.webm'))).toBe('hello world');
    expect(await readAll(storage.read('takes/s/t.webm', { start: 6, end: 10 }))).toBe('world');
    expect(await storage.stat('takes/s/missing.webm')).toBeNull();
  });

  it('T4: objects are write-once; a second put fails and the first survives', async () => {
    const storage = new LocalDiskStorage(root());
    await storage.put('a.webm', chunks('first'), { maxBytes: 100 });
    const error = await failure(storage.put('a.webm', chunks('second'), { maxBytes: 100 }));
    expect(error).toBeInstanceOf(StorageError);
    expect(error instanceof StorageError && error.code).toBe(StorageErrorCode.AlreadyExists);
    expect(await readAll(storage.read('a.webm'))).toBe('first');
  });

  it('T4: an oversized upload fails and leaves no file, not even a temp file', async () => {
    const dir = root();
    const storage = new LocalDiskStorage(dir);
    const error = await failure(storage.put('big.webm', chunks('12345', '67890'), { maxBytes: 7 }));
    expect(error instanceof StorageError && error.code).toBe(StorageErrorCode.TooLarge);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('T4: keys cannot escape the storage root', async () => {
    const storage = new LocalDiskStorage(root());
    for (const key of ['../x', 'a/../../x', '/etc/passwd', '']) {
      const error = await failure(storage.put(key, chunks('x'), { maxBytes: 10 }));
      expect(error instanceof StorageError && error.code, key).toBe(StorageErrorCode.InvalidKey);
    }
  });

  it('T4: the storage interface has no way to delete', () => {
    const storage = new LocalDiskStorage(root());
    expect('delete' in storage || 'remove' in storage || 'unlink' in storage).toBe(false);
  });
});
