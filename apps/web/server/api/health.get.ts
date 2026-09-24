import { defineApiHandler } from '../utils/api-handler';
import { databaseHealth } from '../utils/database';
import { buildAppHealth } from '../utils/health';

export default defineApiHandler(async () => buildAppHealth(await databaseHealth()));
