import { createConfig } from '@repo/config/eslint';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname, vue: true }),
  {
    // Client code must never touch the database layer (SPEC.md §B3).
    files: ['app/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@repo/db', '@repo/db/*', 'typeorm', 'typeorm/*'], message: 'Database code is server-only (SPEC.md §B3).' },
          ],
        },
      ],
    },
  },
  {
    // TypeORM is reached only through @repo/db, so there is one resolved copy (SPEC.md §B3).
    files: ['server/**/*.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['typeorm', 'typeorm/*'], message: 'Import TypeORM types from @repo/db.' }] },
      ],
    },
  },
];
