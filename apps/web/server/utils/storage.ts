import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, open, stat, statfs, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { type ByteRange, type Storage, StorageError, StorageErrorCode } from '@repo/contracts';
import { findRepoRoot } from '@repo/db';

// Local-disk `Storage` (SPEC.md §B2). Objects are write-once: bytes stream into `<key>.<random>.part`, then a
// hard link publishes them only if the key is free, so a finished file is never replaced and a half-written
// upload is never visible. There is no delete (SPEC.md §A6.2).

const KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)*$/i;
const PART_SUFFIX = '.part';

function isErrnoCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

const ERRNO_EXISTS = 'EEXIST';
const ERRNO_MISSING = 'ENOENT';

export class LocalDiskStorage implements Storage {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  capabilities() {
    return { kind: 'local-disk', supportsRange: true };
  }

  private pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!KEY_PATTERN.test(key) || key.split('/').some((part) => part.startsWith('..')) || !path.startsWith(this.root + sep)) {
      throw new StorageError(StorageErrorCode.InvalidKey, `Invalid storage key: ${key}`);
    }
    return path;
  }

  async put(key: string, body: AsyncIterable<Uint8Array>, options: { maxBytes: number; signal?: AbortSignal }): Promise<{ bytes: number }> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    const partPath = `${path}.${randomBytes(6).toString('hex')}${PART_SUFFIX}`;
    const file = await open(partPath, 'wx');
    let bytes = 0;
    try {
      for await (const chunk of body) {
        if (options.signal?.aborted === true) {
          throw new StorageError(StorageErrorCode.Cancelled, 'Upload cancelled.');
        }
        bytes += chunk.byteLength;
        if (bytes > options.maxBytes) {
          throw new StorageError(StorageErrorCode.TooLarge, `Upload exceeds ${String(options.maxBytes)} bytes.`);
        }
        await file.write(chunk);
      }
      await file.sync();
      await file.close();
      try {
        await link(partPath, path);
      } catch (error) {
        if (isErrnoCode(error, ERRNO_EXISTS)) {
          throw new StorageError(StorageErrorCode.AlreadyExists, `Storage key already exists: ${key}`);
        }
        throw error;
      }
      return { bytes };
    } finally {
      await file.close().catch(() => undefined);
      // The temp file is not an object; removing it is not a delete of stored media.
      await unlink(partPath).catch(() => undefined);
    }
  }

  async stat(key: string): Promise<{ bytes: number } | null> {
    try {
      const info = await stat(this.pathOf(key));
      return { bytes: info.size };
    } catch (error) {
      if (isErrnoCode(error, ERRNO_MISSING)) {
        return null;
      }
      throw error;
    }
  }

  read(key: string, range?: ByteRange): AsyncIterable<Uint8Array> {
    return createReadStream(this.pathOf(key), range === undefined ? {} : { start: range.start, end: range.end });
  }

  async freeBytes(): Promise<number> {
    await mkdir(this.root, { recursive: true });
    const info = await statfs(this.root);
    return info.bavail * info.bsize;
  }
}

const GIB = 1024 ** 3;

export interface StorageConfig {
  root: string;
  maxUploadBytes: number;
  minFreeBytes: number;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** `STORAGE_DIR` (relative to the repo root, default `storage/`), `MAX_UPLOAD_BYTES`, `MIN_FREE_BYTES`. */
export function readStorageConfig(env: Readonly<Partial<Record<string, string>>>): StorageConfig {
  const configured = env.STORAGE_DIR?.trim();
  const root = configured === undefined || configured.length === 0 ? 'storage' : configured;
  return {
    root: isAbsolute(root) ? root : join(findRepoRoot(), root),
    maxUploadBytes: positiveInt(env.MAX_UPLOAD_BYTES, 2 * GIB),
    minFreeBytes: positiveInt(env.MIN_FREE_BYTES, GIB),
  };
}

let storage: { config: StorageConfig; instance: LocalDiskStorage } | undefined;

export function useMediaStorage(): { config: StorageConfig; instance: Storage } {
  storage ??= (() => {
    const config = readStorageConfig(process.env);
    return { config, instance: new LocalDiskStorage(config.root) };
  })();
  return storage;
}
