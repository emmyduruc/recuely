import { listProjects, toProject } from '@repo/db';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { queryFlag } from '../../utils/validation';

export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  return (await listProjects(ds, user.id, queryFlag(getQuery(event).archived))).map(toProject);
});
