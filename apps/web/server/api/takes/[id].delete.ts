import { ApiErrorCode } from '@repo/contracts';
import { softDeleteTake, toTake } from '@repo/db';
import { unprocessable } from '../../utils/api-error';
import { defineApiHandler } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requireTake } from '../../utils/recording';
import { queryFlag } from '../../utils/validation';

/** Soft delete only, and only with `confirm=true`. The row and media stay; POST …/restore undoes it. */
export default defineApiHandler(async (event) => {
  if (!queryFlag(getQuery(event).confirm)) {
    throw unprocessable(ApiErrorCode.ConfirmationRequired, 'Deleting a take needs confirm=true.', [
      { field: 'confirm', issue: 'must be true' },
    ]);
  }
  const { ds, user } = await useLocalUser();
  const take = await requireTake(ds, user, getRouterParam(event, 'id') ?? '');
  return toTake(await softDeleteTake(ds, take));
});
