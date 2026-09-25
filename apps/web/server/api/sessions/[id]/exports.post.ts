import { ContractType } from '@repo/contracts';
import { createExport, toExport } from '@repo/db';
import { HttpStatus } from '../../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { requireSession } from '../../../utils/recording';
import { parseBody } from '../../../utils/validation';

/** Records an export request (status `pending`); producing the files is Task 17. */
export default defineApiHandler(async (event) => {
  const request = parseBody(ContractType.CreateExportRequest, await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const session = await requireSession(ds, user, getRouterParam(event, 'id') ?? '');
  const created = toExport(await createExport(ds, session.id, request.kind));
  setResponseStatus(event, HttpStatus.Created);
  return created;
});
