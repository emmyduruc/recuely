import { toUser } from '@repo/db';
import { defineApiHandler } from '../utils/api-handler';
import { useLocalUser } from '../utils/local-user';

export default defineApiHandler(async () => toUser((await useLocalUser()).user));
