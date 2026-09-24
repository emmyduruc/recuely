import { getOrCreateSettings, toUserSettings } from '@repo/db';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';

export default defineApiHandler(async () => {
  const { ds, user } = await useLocalUser();
  return toUserSettings(await getOrCreateSettings(ds, user.id));
});
