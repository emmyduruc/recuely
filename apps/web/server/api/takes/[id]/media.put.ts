import { ApiErrorCode, StorageError, StorageErrorCode } from '@repo/contracts';
import { attachTakeMedia, toTake } from '@repo/db';
import { ApiException, conflict, HttpStatus } from '../../../utils/api-error';
import { defineApiHandler } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { baseMediaType, mediaKey } from '../../../utils/media';
import { requireTake } from '../../../utils/recording';
import { useMediaStorage } from '../../../utils/storage';

const tooLarge = (): ApiException =>
  new ApiException(HttpStatus.PayloadTooLarge, ApiErrorCode.PayloadTooLarge, 'The upload is larger than MAX_UPLOAD_BYTES.');
const alreadyUploaded = (): ApiException => conflict('This take already has media; takes are never overwritten.');

const STORAGE_FAILURE: Partial<Record<StorageErrorCode, () => ApiException>> = {
  [StorageErrorCode.TooLarge]: tooLarge,
  [StorageErrorCode.AlreadyExists]: alreadyUploaded,
};

/**
 * Step 2 of an upload: the raw body streams straight to disk (never buffered in memory), into a temp file
 * that is published only when complete. Media is write-once (SPEC.md Task 4 streaming rule).
 */
export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  const take = await requireTake(ds, user, getRouterParam(event, 'id') ?? '');
  if (take.deletedAt !== null) {
    throw conflict('Restore the take before uploading its media.');
  }
  if (take.mediaKey !== null) {
    throw alreadyUploaded();
  }
  const type = baseMediaType(take.mimeType);
  const sent = baseMediaType(getRequestHeader(event, 'content-type') ?? '');
  if (type === null || sent !== type) {
    throw new ApiException(
      HttpStatus.UnsupportedMediaType,
      ApiErrorCode.UnsupportedMediaType,
      `Send the body with Content-Type ${type ?? take.mimeType}.`,
    );
  }

  const { config, instance } = useMediaStorage();
  const declared = Number(getRequestHeader(event, 'content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > config.maxUploadBytes) {
    throw tooLarge();
  }
  const needed = (Number.isFinite(declared) ? declared : 0) + config.minFreeBytes;
  if ((await instance.freeBytes()) < needed) {
    throw new ApiException(HttpStatus.InsufficientStorage, ApiErrorCode.InsufficientStorage, 'Not enough free disk space for this take.');
  }

  const key = mediaKey(take.sessionId, take.id, type);
  let bytes: number;
  try {
    ({ bytes } = await instance.put(key, event.node.req, { maxBytes: config.maxUploadBytes }));
  } catch (error) {
    const mapped = error instanceof StorageError ? STORAGE_FAILURE[error.code] : undefined;
    throw mapped === undefined ? error : mapped();
  }
  const updated = await attachTakeMedia(ds, take, key, bytes);
  if (updated === null) {
    throw alreadyUploaded();
  }
  return toTake(updated);
});
