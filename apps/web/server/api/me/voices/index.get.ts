import { listVoiceFavorites, toVoiceFavorite } from '@repo/db';
import { defineApiHandler } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';

export default defineApiHandler(async () => {
  const { ds, user } = await useLocalUser();
  return (await listVoiceFavorites(ds, user.id)).map(toVoiceFavorite);
});
