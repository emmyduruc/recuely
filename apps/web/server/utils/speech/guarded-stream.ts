// Deadlines for streaming upstream responses (SPEC.md §B12; Task 10a found stalls before and during the stream).

export const StreamFailure = {
  FirstByteTimeout: 'first_byte_timeout',
  Stalled: 'stalled',
} as const;
export type StreamFailure = (typeof StreamFailure)[keyof typeof StreamFailure];

export class StreamDeadlineError extends Error {
  override name = 'StreamDeadlineError';
  readonly failure: StreamFailure;

  constructor(failure: StreamFailure) {
    super(`Upstream stream failed: ${failure}`);
    this.failure = failure;
  }
}

export interface Deadlines {
  /** From the start of the request until the first body byte. */
  firstByteMs: number;
  /** Longest gap between two chunks once the body has started. */
  stallMs: number;
}

/** Resolves with the read result, or rejects when `ms` pass first. The timer never outlives the race. */
async function readWithin<T>(read: Promise<T>, ms: number, failure: StreamFailure): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new StreamDeadlineError(failure));
    }, ms);
  });
  try {
    return await Promise.race([read, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Yields the chunks of `body`, failing with `first_byte_timeout` if the first chunk takes longer than what's
 * left of `firstByteMs` (measured from `startedAt`), or `stalled` if any later gap exceeds `stallMs`. On
 * failure the reader is cancelled and `abort` is called so the upstream connection closes.
 */
export async function* guardedStream(
  body: ReadableStream<Uint8Array>,
  deadlines: Deadlines,
  startedAt: number,
  abort: () => void,
  now: () => number = () => performance.now(),
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let first = true;
  try {
    for (;;) {
      const remaining = first ? Math.max(0, deadlines.firstByteMs - (now() - startedAt)) : deadlines.stallMs;
      const result = await readWithin(reader.read(), remaining, first ? StreamFailure.FirstByteTimeout : StreamFailure.Stalled);
      if (result.done) return;
      if (result.value.byteLength === 0) continue;
      first = false;
      yield result.value;
    }
  } catch (error) {
    abort();
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
