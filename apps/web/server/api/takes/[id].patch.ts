import { ContractType } from '@repo/contracts';
import { toTake, updateTake } from '@repo/db';
import { conflict } from '../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { requireTake } from '../../utils/recording';
import { parseBody } from '../../utils/validation';

export default defineApiHandler(async (event) => {
  const patch = parseBody(ContractType.UpdateTakeRequest, await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  const take = await requireTake(ds, user, getRouterParam(event, 'id') ?? '');
  if (patch.selected === true && take.deletedAt !== null) {
    throw conflict('A deleted take cannot be selected; restore it first.');
  }
  if (patch.selected === true && take.mediaKey === null) {
    throw conflict('Upload the take’s media before selecting it.');
  }
  return toTake(await updateTake(ds, take, patch));
});
