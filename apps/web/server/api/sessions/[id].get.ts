import { toSession } from '@repo/db';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requireSession } from '../../utils/recording';

export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  return toSession(await requireSession(ds, user, getRouterParam(event, 'id') ?? ''));
});
