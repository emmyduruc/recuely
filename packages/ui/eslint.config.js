import { createConfig } from '@repo/config/eslint';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  vue: true,
  restrictedImports: ['typeorm', '@repo/db', '@repo/session-engine'],
});
