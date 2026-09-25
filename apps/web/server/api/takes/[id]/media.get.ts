import { Readable } from 'node:stream';
import { ApiErrorCode } from '@repo/contracts';
import { ApiException, HttpStatus, notFound } from '../../../utils/api-error';
import { defineApiHandler } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { parseRange, RangeKind } from '../../../utils/media';
import { requireTake } from '../../../utils/recording';
import { useMediaStorage } from '../../../utils/storage';

/** Streams a take's media; a single `Range` gets 206 so players can seek. Soft-deleted takes stay playable. */
export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  const take = await requireTake(ds, user, getRouterParam(event, 'id') ?? '');
  const { instance } = useMediaStorage();
  const info = take.mediaKey === null ? null : await instance.stat(take.mediaKey);
  if (take.mediaKey === null || info === null) {
    throw notFound('No media has been uploaded for this take.');
  }
  const request = parseRange(getRequestHeader(event, 'range'), info.bytes);
  if (request.kind === RangeKind.Unsatisfiable) {
    setResponseHeader(event, 'content-range', `bytes */${String(info.bytes)}`);
    throw new ApiException(HttpStatus.RangeNotSatisfiable, ApiErrorCode.RangeNotSatisfiable, 'The requested range is outside the file.');
  }
  // Media headers only once we know the body is media (errors stay JSON).
  setResponseHeaders(event, { 'content-type': take.mimeType, 'accept-ranges': 'bytes' });
  if (request.kind === RangeKind.Partial) {
    const { start, end } = request.range;
    setResponseStatus(event, HttpStatus.PartialContent);
    setResponseHeaders(event, {
      'content-range': `bytes ${String(start)}-${String(end)}/${String(info.bytes)}`,
      'content-length': end - start + 1,
    });
    return sendStream(event, Readable.from(instance.read(take.mediaKey, request.range)));
  }
  setResponseHeader(event, 'content-length', info.bytes);
  return sendStream(event, Readable.from(instance.read(take.mediaKey)));
});
