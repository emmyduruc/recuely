import { toChunkPlan } from '@repo/db';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requirePlan } from '../../utils/recording';

export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  const { plan, chunks } = await requirePlan(ds, user, getRouterParam(event, 'id') ?? '');
  return toChunkPlan(plan, chunks);
});
