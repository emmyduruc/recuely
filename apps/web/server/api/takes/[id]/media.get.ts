import { notFound } from '../../../utils/api-error';
import { defineApiHandler } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { requireTake } from '../../../utils/recording';
import { useMediaStorage } from '../../../utils/storage';
import { sendStoredObject } from '../../../utils/stored-media';

/** Streams a take's media; a single `Range` gets 206 so players can seek. Soft-deleted takes stay playable. */
export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  const take = await requireTake(ds, user, getRouterParam(event, 'id') ?? '');
  const { instance } = useMediaStorage();
  const info = take.mediaKey === null ? null : await instance.stat(take.mediaKey);
  if (take.mediaKey === null || info === null) {
    throw notFound('No media has been uploaded for this take.');
  }
  return sendStoredObject(event, instance, take.mediaKey, take.mimeType, info.bytes);
});
