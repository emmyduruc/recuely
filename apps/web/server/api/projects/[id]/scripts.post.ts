import { ContractType } from '@repo/contracts';
import { createScriptVersion, toScript } from '@repo/db';
import { HttpStatus } from '../../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { buildScriptBlocks, requireProject } from '../../../utils/recording';
import { parseBody } from '../../../utils/validation';

export default defineApiHandler(async (event) => {
  const request = parseBody(ContractType.CreateScriptRequest, await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const project = await requireProject(ds, user, getRouterParam(event, 'id') ?? '');
  const blocks = await buildScriptBlocks(ds, project, request);
  const { script, blocks: saved } = await createScriptVersion(ds, project, {
    sourceKind: request.sourceKind,
    sourceText: request.sourceText,
    blocks,
  });
  setResponseStatus(event, HttpStatus.Created);
  return toScript(script, saved);
});
