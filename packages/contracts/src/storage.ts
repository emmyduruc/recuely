// Media storage provider (SPEC.md §B2/§B3). Local disk in R1; S3-compatible later behind the same interface.
// There is deliberately no delete: takes and their media are never removed by the app (SPEC.md §A6.2).

export const StorageErrorCode = {
  NotFound: 'not_found',
  /** The key already holds an object; objects are write-once. */
  AlreadyExists: 'already_exists',
  TooLarge: 'too_large',
  InsufficientSpace: 'insufficient_space',
  Cancelled: 'cancelled',
  InvalidKey: 'invalid_key',
} as const;
export type StorageErrorCode = (typeof StorageErrorCode)[keyof typeof StorageErrorCode];

export class StorageError extends Error {
  override name = 'StorageError';
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface StorageCapabilities {
  kind: string;
  supportsRange: boolean;
}

export interface StoragePutOptions {
  /** The write fails with `too_large` (and leaves nothing behind) once more bytes than this arrive. */
  maxBytes: number;
  signal?: AbortSignal;
}

/** Inclusive byte range, as in HTTP `Range: bytes=start-end`. */
export interface ByteRange {
  start: number;
  end: number;
}

export interface Storage {
  capabilities(): StorageCapabilities;
  /** Streams `body` into a new object. Write-once: an existing key fails with `already_exists`. */
  put(key: string, body: AsyncIterable<Uint8Array>, options: StoragePutOptions): Promise<{ bytes: number }>;
  /** Size of an object, or null if absent. */
  stat(key: string): Promise<{ bytes: number } | null>;
  /** Streams an object (or an inclusive byte range of it). */
  read(key: string, range?: ByteRange): AsyncIterable<Uint8Array>;
  /** Free space available to new objects, in bytes. */
  freeBytes(): Promise<number>;
}
