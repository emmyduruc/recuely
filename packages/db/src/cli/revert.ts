import { runWithDataSource } from './run.ts';

await runWithDataSource(async (ds) => {
  await ds.undoLastMigration({ transaction: 'each' });
  console.log('Reverted the last migration.');
});
