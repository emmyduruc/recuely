import { defineApiHandler } from '../utils/api-handler';
import { databaseHealth } from '../utils/database';
import { buildAppHealth, speechHealth } from '../utils/health';

export default defineApiHandler(async () => {
  const [db, speech] = await Promise.all([databaseHealth(), speechHealth()]);
  return buildAppHealth(db, speech);
});
