import { toProject } from '@repo/db';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requireProject } from '../../utils/recording';

export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  return toProject(await requireProject(ds, user, getRouterParam(event, 'id') ?? ''));
});
