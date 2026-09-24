import { isUuid, removeVoiceFavorite } from '@repo/db';
import { HttpStatus, notFound } from '../../../utils/api-error';
import { defineApiHandler } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';

export default defineApiHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? '';
  const { ds, user } = await useLocalUser();
  if (!isUuid(id) || !(await removeVoiceFavorite(ds, user.id, id))) {
    throw notFound('No favorite voice with this id.');
  }
  setResponseStatus(event, HttpStatus.NoContent);
  return null;
});
