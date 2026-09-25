import { ApiErrorCode, ContractType } from '@repo/contracts';
import { chunkExists, createTake, toTake } from '@repo/db';
import { HttpStatus, unprocessable } from '../../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { requireSession } from '../../../utils/recording';
import { parseBody } from '../../../utils/validation';

/** Step 1 of an upload: the take row exists before any media arrives, so a crash can't lose it. */
export default defineApiHandler(async (event) => {
  const request = parseBody(ContractType.CreateTakeRequest, await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const session = await requireSession(ds, user, getRouterParam(event, 'id') ?? '');
  if (!(await chunkExists(ds, session.chunkPlanId, request.chunkId))) {
    throw unprocessable(ApiErrorCode.ValidationFailed, 'Unknown chunk.', [{ field: 'chunkId', issue: 'is not in the session’s plan' }]);
  }
  const take = toTake(await createTake(ds, session, request));
  setResponseStatus(event, HttpStatus.Created);
  return take;
});
