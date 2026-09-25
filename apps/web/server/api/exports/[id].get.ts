import { toExport } from '@repo/db';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requireExport } from '../../utils/recording';

export default defineApiHandler(async (event) => {
  const { ds, user } = await useLocalUser();
  return toExport(await requireExport(ds, user, getRouterParam(event, 'id') ?? ''));
});
