import { listTakes, toTake } from '@repo/db';
import { defineApiHandler } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { requireSession } from '../../../utils/recording';
import { queryFlag } from '../../../utils/validation';

export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  const session = await requireSession(ds, user, getRouterParam(event, 'id') ?? '');
  return (await listTakes(ds, session.id, queryFlag(getQuery(event).includeDeleted))).map(toTake);
});
