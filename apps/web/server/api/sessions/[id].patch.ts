import { ApiErrorCode, ContractType } from '@repo/contracts';
import { isPgError, PgErrorCode, toSession, updateSession } from '@repo/db';
import { ApiException, HttpStatus, unprocessable } from '../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requirePlan, requireSession } from '../../utils/recording';
import { parseBody } from '../../utils/validation';

/** Autosave. Rejects stale snapshots (seq not greater than the stored one) with 409 (SPEC.md §A6.7). */
export default defineApiHandler(async (event) => {
  const patch = parseBody(ContractType.UpdateSessionRequest, await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const session = await requireSession(ds, user, getRouterParam(event, 'id') ?? '');
  if (patch.chunkPlanId !== undefined) {
    const { script } = await requirePlan(ds, user, patch.chunkPlanId);
    if (script.projectId !== session.projectId) {
      throw unprocessable(ApiErrorCode.ValidationFailed, 'The plan belongs to another project.', [
        { field: 'chunkPlanId', issue: 'must be a plan of this session’s project' },
      ]);
    }
  }
  try {
    const saved = await updateSession(ds, session, patch);
    if (saved === null) {
      throw new ApiException(HttpStatus.Conflict, ApiErrorCode.StaleUpdate, 'A newer snapshot is already saved (seq).');
    }
    return toSession(saved);
  } catch (error) {
    if (isPgError(error, PgErrorCode.ForeignKeyViolation)) {
      throw unprocessable(ApiErrorCode.ValidationFailed, 'The current chunk is not in the plan.', [
        { field: 'currentChunkId', issue: 'must be a chunk of the session’s plan' },
      ]);
    }
    throw error;
  }
});
