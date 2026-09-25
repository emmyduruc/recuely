import { ContractType } from '@repo/contracts';
import { createChunkPlan, toChunkPlan } from '@repo/db';
import { HttpStatus } from '../../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { buildPlanChunks, requireScript } from '../../../utils/recording';
import { parseBody } from '../../../utils/validation';

export default defineApiHandler(async (event) => {
  const request = parseBody(ContractType.CreateChunkPlanRequest, await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const script = await requireScript(ds, user, getRouterParam(event, 'id') ?? '');
  const chunks = await buildPlanChunks(ds, script, request);
  const { plan, chunks: saved } = await createChunkPlan(ds, script, request.mode, chunks);
  setResponseStatus(event, HttpStatus.Created);
  return toChunkPlan(plan, saved);
});
