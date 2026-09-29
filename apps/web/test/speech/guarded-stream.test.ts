import { describe, expect, it } from 'vitest';
import { guardedStream, StreamDeadlineError, StreamFailure } from '../../server/utils/speech/guarded-stream';

/** A body that yields each chunk after its delay (ms); `null` means "never send anything more". */
function delayedBody(steps: (readonly [number, string] | null)[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const step = steps[index];
      index += 1;
      if (step === undefined) {
        controller.close();
        return;
      }
      if (step === null) {
        await new Promise(() => undefined);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, step[0]));
      controller.enqueue(new TextEncoder().encode(step[1]));
    },
  });
}

async function collect(stream: AsyncIterable<Uint8Array>): Promise<string> {
  let text = '';
  for await (const part of stream) text += new TextDecoder().decode(part);
  return text;
}

const deadlines = { firstByteMs: 80, stallMs: 80 };

describe('guardedStream (Task 10a: stalls before and during the stream)', () => {
  it('T10: passes a healthy stream through', async () => {
    let aborted = false;
    const body = delayedBody([[10, 'ab'], [10, 'cd']]);
    expect(await collect(guardedStream(body, deadlines, performance.now(), () => (aborted = true)))).toBe('abcd');
    expect(aborted).toBe(false);
  });

  it('T10: fails with first_byte_timeout when nothing arrives in time, and aborts upstream', async () => {
    let aborted = false;
    const body = delayedBody([null]);
    await expect(collect(guardedStream(body, deadlines, performance.now(), () => (aborted = true)))).rejects.toEqual(
      new StreamDeadlineError(StreamFailure.FirstByteTimeout),
    );
    expect(aborted).toBe(true);
  });

  it('T10: the first-byte budget counts from the request start (time already spent on headers)', async () => {
    const body = delayedBody([[50, 'late']]);
    await expect(collect(guardedStream(body, deadlines, performance.now() - 60, () => undefined))).rejects.toBeInstanceOf(StreamDeadlineError);
  });

  it('T10: fails with stalled when the stream stops mid-way', async () => {
    let aborted = false;
    const body = delayedBody([[5, 'ab'], null]);
    await expect(collect(guardedStream(body, deadlines, performance.now(), () => (aborted = true)))).rejects.toEqual(
      new StreamDeadlineError(StreamFailure.Stalled),
    );
    expect(aborted).toBe(true);
  });
});
