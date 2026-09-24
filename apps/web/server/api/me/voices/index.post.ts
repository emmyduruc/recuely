import { addVoiceFavorite, isPgError, PgErrorCode, toVoiceFavorite } from '@repo/db';
import { conflict, HttpStatus } from '../../../utils/api-error';
import { defineApiHandler, readJsonBody } from '../../../utils/api-handler';
import { useLocalUser } from '../../../utils/local-user';
import { parseAddVoiceFavorite } from '../../../utils/validation';

export default defineApiHandler(async (event) => {
  const request = parseAddVoiceFavorite(await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  try {
    const favorite = toVoiceFavorite(await addVoiceFavorite(ds, user.id, request));
    setResponseStatus(event, HttpStatus.Created);
    return favorite;
  } catch (error) {
    if (isPgError(error, PgErrorCode.UniqueViolation)) {
      throw conflict('This voice is already a favorite.');
    }
    throw error;
  }
});
