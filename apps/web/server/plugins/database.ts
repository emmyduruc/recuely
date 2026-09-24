import { closeDataSource, useDataSource } from '../utils/database';

/** Connects once at startup so config problems show up immediately in the log (SPEC.md Task 1). */
export default defineNitroPlugin((nitroApp) => {
  useDataSource().then(
    () => {
      console.info('[db] connected');
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[db] ${message} Database routes will answer 503 until this is fixed.`);
    },
  );
  nitroApp.hooks.hook('close', closeDataSource);
});
