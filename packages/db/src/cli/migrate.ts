import { runWithDataSource } from './run.ts';

await runWithDataSource(async (ds) => {
  const applied = await ds.runMigrations({ transaction: 'each' });
  console.log(applied.length === 0 ? 'No pending migrations.' : `Applied: ${applied.map((m) => m.name).join(', ')}`);
});
