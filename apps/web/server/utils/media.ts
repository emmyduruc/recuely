import { type ByteRange, isValueOf, MediaType } from '@repo/contracts';

// Pure helpers for media routes (unit-tested in test/media.test.ts).

const FILE_EXTENSION: Record<MediaType, string> = {
  [MediaType.VideoWebm]: '.webm',
  [MediaType.VideoMp4]: '.mp4',
  [MediaType.AudioWebm]: '.webm',
  [MediaType.AudioMp4]: '.m4a',
  [MediaType.AudioOgg]: '.ogg',
  [MediaType.AudioWav]: '.wav',
};

/** `video/webm;codecs=vp9` → `video/webm`, or null if it isn't an accepted container type. */
export function baseMediaType(mimeType: string): MediaType | null {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return isValueOf(MediaType, base) ? base : null;
}

/** File extension for a container type (e.g. to name an upload for a provider that sniffs by name). */
export function mediaExtension(type: MediaType): string {
  return FILE_EXTENSION[type];
}

export function mediaKey(sessionId: string, takeId: string, type: MediaType): string {
  return `takes/${sessionId}/${takeId}${FILE_EXTENSION[type]}`;
}

export const RangeKind = {
  Full: 'full',
  Partial: 'partial',
  Unsatisfiable: 'unsatisfiable',
} as const;
export type RangeKind = (typeof RangeKind)[keyof typeof RangeKind];

export type RangeRequest =
  | { kind: typeof RangeKind.Full }
  | { kind: typeof RangeKind.Partial; range: ByteRange }
  | { kind: typeof RangeKind.Unsatisfiable };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Parses a `Range` header against an object of `size` bytes. One range is supported (`a-b`, `a-`, `-n`);
 * anything else (absent, multiple ranges, other units) serves the whole object, as RFC 9110 allows.
 */
export function parseRange(header: string | undefined, size: number): RangeRequest {
  const match = header === undefined ? null : SINGLE_RANGE.exec(header.trim());
  if (match === null) {
    return { kind: RangeKind.Full };
  }
  const [, first = '', last = ''] = match;
  if (first.length === 0 && last.length === 0) {
    return { kind: RangeKind.Full };
  }
  if (first.length === 0) {
    const suffix = Number(last);
    return suffix === 0 || size === 0
      ? { kind: RangeKind.Unsatisfiable }
      : { kind: RangeKind.Partial, range: { start: Math.max(0, size - suffix), end: size - 1 } };
  }
  const start = Number(first);
  const end = last.length === 0 ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size || end < start) {
    return { kind: RangeKind.Unsatisfiable };
  }
  return { kind: RangeKind.Partial, range: { start, end } };
}
