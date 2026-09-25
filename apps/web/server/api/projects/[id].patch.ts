import { toProject, updateProject } from '@repo/db';
import { defineApiHandler, readJsonBody } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requireProject } from '../../utils/recording';
import { parseUpdateProject } from '../../utils/validation';

export default defineApiHandler(async (event) => {
  const patch = parseUpdateProject(await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const project = await requireProject(ds, user, getRouterParam(event, 'id') ?? '');
  return toProject(await updateProject(ds, project, patch));
});
