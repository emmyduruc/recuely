import { scriptBlocks, toScript } from '@repo/db';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requireScript } from '../../utils/recording';

export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  const script = await requireScript(ds, user, getRouterParam(event, 'id') ?? '');
  return toScript(script, await scriptBlocks(ds, script.id));
});
