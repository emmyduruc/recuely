import { isPgError, PgErrorCode, toUser, updateUser } from '@repo/db';
import { conflict } from '../utils/api-error';
import { defineApiHandler, readJsonBody } from '../utils/api-handler';
import { useLocalUser } from '../utils/local-user';
import { parseUpdateMe } from '../utils/validation';

export default defineApiHandler(async (event) => {
  const patch = parseUpdateMe(await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  try {
    return toUser(await updateUser(ds, user, patch));
  } catch (error) {
    if (isPgError(error, PgErrorCode.UniqueViolation)) {
      throw conflict('Another user already has this email address.');
    }
    throw error;
  }
});
