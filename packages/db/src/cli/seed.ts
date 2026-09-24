import { seedLocalUser } from '../seed.ts';
import { runWithDataSource } from './run.ts';

await runWithDataSource(async (ds) => {
  const { user, createdUser } = await seedLocalUser(ds);
  console.log(createdUser ? `Created local user ${user.id}.` : `Local user ${user.id} already exists.`);
});
