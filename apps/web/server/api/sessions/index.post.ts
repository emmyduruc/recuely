import { ApiErrorCode, ContractType } from '@repo/contracts';
import { createSession, deviceBelongsTo, toSession } from '@repo/db';
import { HttpStatus, unprocessable } from '../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requirePlan } from '../../utils/recording';
import { parseBody } from '../../utils/validation';

export default defineApiHandler(async (event) => {
  const request = parseBody(ContractType.CreateSessionRequest, await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const { plan, script } = await requirePlan(ds, user, request.chunkPlanId);
  if (request.deviceId !== undefined && !(await deviceBelongsTo(ds, user.id, request.deviceId))) {
    throw unprocessable(ApiErrorCode.ValidationFailed, 'Unknown device.', [{ field: 'deviceId', issue: 'is not a device of this user' }]);
  }
  const session = await createSession(ds, {
    projectId: script.projectId,
    userId: user.id,
    deviceId: request.deviceId ?? null,
    chunkPlanId: plan.id,
  });
  setResponseStatus(event, HttpStatus.Created);
  return toSession(session);
});
