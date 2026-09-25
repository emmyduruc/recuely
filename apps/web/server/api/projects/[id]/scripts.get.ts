import { listScripts, toScriptSummary } from '@repo/db';
import { defineApiHandler } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { requireProject } from '../../../utils/recording';

export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  const project = await requireProject(ds, user, getRouterParam(event, 'id') ?? '');
  return (await listScripts(ds, project.id)).map(({ script, blockCount }) => toScriptSummary(script, blockCount));
});
