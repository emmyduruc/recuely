import { createConfig } from '@repo/config/eslint';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  restrictedImports: ['vue', 'nuxt', '#app', '#imports', 'typeorm', '@repo/db', '@repo/media-adapters', '@repo/ui'],
});
