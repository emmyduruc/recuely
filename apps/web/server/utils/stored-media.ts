import { Readable } from 'node:stream';
import { ApiErrorCode, type Storage } from '@repo/contracts';
import { ApiException, HttpStatus } from './api-error';
import { parseRange, RangeKind } from './media';

type ApiEvent = InstanceType<typeof H3Event>;

/**
 * Streams a stored object with its content type; a single `Range` gets 206 so players can seek. Media headers
 * are set only once the body is known to be media, so errors stay JSON.
 */
export async function sendStoredObject(event: ApiEvent, storage: Storage, key: string, contentType: string, size: number): Promise<void> {
  const request = parseRange(getRequestHeader(event, 'range'), size);
  if (request.kind === RangeKind.Unsatisfiable) {
    setResponseHeader(event, 'content-range', `bytes */${String(size)}`);
    throw new ApiException(HttpStatus.RangeNotSatisfiable, ApiErrorCode.RangeNotSatisfiable, 'The requested range is outside the file.');
  }
  setResponseHeaders(event, { 'content-type': contentType, 'accept-ranges': 'bytes' });
  if (request.kind === RangeKind.Partial) {
    const { start, end } = request.range;
    setResponseStatus(event, HttpStatus.PartialContent);
    setResponseHeaders(event, { 'content-range': `bytes ${String(start)}-${String(end)}/${String(size)}`, 'content-length': end - start + 1 });
    return sendStream(event, Readable.from(storage.read(key, request.range)));
  }
  setResponseHeader(event, 'content-length', size);
  return sendStream(event, Readable.from(storage.read(key)));
}
