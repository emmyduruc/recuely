import { toProject, updateProject } from '@repo/db';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requireProject } from '../../utils/recording';

/** Archives; nothing is deleted. PATCH `{ archived: false }` restores. */
export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  const project = await requireProject(ds, user, getRouterParam(event, 'id') ?? '');
  return toProject(await updateProject(ds, project, { archived: true }));
});
