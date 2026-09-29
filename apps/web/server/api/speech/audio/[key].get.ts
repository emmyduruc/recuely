import { notFound } from '../../../utils/api-error';
import { defineApiHandler } from '../../../utils/api-handler';
import { audioObjectKey, CACHE_KEY_PATTERN, readClipMeta } from '../../../utils/speech/cache';
import { useMediaStorage } from '../../../utils/storage';
import { sendStoredObject } from '../../../utils/stored-media';

/** A cached clip from `POST /api/speech/tts`, with `Range` support. */
export default defineApiHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? '';
  const { instance } = useMediaStorage();
  const meta = CACHE_KEY_PATTERN.test(key) ? await readClipMeta(instance, key) : null;
  const info = meta === null ? null : await instance.stat(audioObjectKey(key));
  if (meta === null || info === null) {
    throw notFound('No cached audio with this key.');
  }
  return sendStoredObject(event, instance, audioObjectKey(key), meta.contentType, info.bytes);
});
