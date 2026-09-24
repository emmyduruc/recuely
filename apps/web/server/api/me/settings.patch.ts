import { toUserSettings, updateSettings } from '@repo/db';
import { defineApiHandler, readJsonBody } from '../../utils/api-handler';
import { useLocalUser } from '../../utils/local-user';
import { parseUpdateSettings } from '../../utils/validation';

export default defineApiHandler(async (event) => {
  const patch = parseUpdateSettings(await readJsonBody(event));
  const { ds, user } = await useLocalUser();
  return toUserSettings(await updateSettings(ds, user.id, patch));
});
