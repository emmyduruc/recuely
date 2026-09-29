import { ApiErrorCode, SpeechLimits } from '@repo/contracts';
import { ApiException, HttpStatus, validationFailed } from '../../utils/api-error';
import { defineApiHandler } from '../../utils/api-handler';
import { baseMediaType, mediaExtension } from '../../utils/media';
import { useSpeechContext } from '../../utils/speech/context';
import { transcribe } from '../../utils/speech/service';

const SEQ_PATTERN = /^\d+$/;

function tooLarge(): ApiException {
  return new ApiException(HttpStatus.PayloadTooLarge, ApiErrorCode.PayloadTooLarge, 'Takes sent for transcription must be at most 25 MB.');
}

/** Reads the raw body up to `max` bytes (OpenAI needs the whole file; takes are short VAD segments). */
async function readBody(stream: AsyncIterable<Uint8Array>, max: number): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  let bytes = 0;
  for await (const part of stream) {
    bytes += part.byteLength;
    if (bytes > max) throw tooLarge();
    parts.push(part);
  }
  return Buffer.concat(parts);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Transcript of one take (SPEC.md §B12): OpenAI after consent, else the local AI service; ids are echoed. */
export default defineApiHandler(async (event) => {
  const contentType = getRequestHeader(event, 'content-type') ?? '';
  const type = baseMediaType(contentType);
  if (type === null) {
    throw new ApiException(HttpStatus.UnsupportedMediaType, ApiErrorCode.UnsupportedMediaType, 'Send the take as audio/wav, audio/webm, audio/mp4, audio/ogg, video/webm or video/mp4.');
  }
  const query = getQuery(event);
  const seq = optionalText(query.seq);
  if (seq !== undefined && !SEQ_PATTERN.test(seq)) {
    throw validationFailed([{ field: 'seq', issue: 'must be a non-negative integer' }]);
  }
  const declared = Number(getRequestHeader(event, 'content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > SpeechLimits.audioBytesMax) throw tooLarge();
  const bytes = await readBody(event.node.req, SpeechLimits.audioBytesMax);
  if (bytes.length === 0) {
    throw validationFailed([{ field: '(body)', issue: 'must contain audio' }]);
  }
  const sessionId = optionalText(query.sessionId);
  const chunkId = optionalText(query.chunkId);
  const ids = {
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(chunkId === undefined ? {} : { chunkId }),
    ...(seq === undefined ? {} : { seq: Number(seq) }),
  };
  return transcribe(await useSpeechContext(), { bytes, contentType: type, filename: `take${mediaExtension(type)}`, ids });
});
