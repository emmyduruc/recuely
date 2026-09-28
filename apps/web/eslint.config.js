import { createConfig, noNestedTernaryInTemplate, noStringLiteralCompare } from '@repo/config/eslint';

// §B11: text is translated only through the typed `useT()` wrapper, so every key is checked.
const untypedI18n = [
  { selector: "CallExpression[callee.name='useI18n']", message: 'Use useT() (typed MessageKey), not useI18n(). See SPEC.md §B11.' },
  { selector: "Identifier[name='$t']", message: 'Use useT() (typed MessageKey), not $t. See SPEC.md §B11.' },
];

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
    files: ['app/**/*.{ts,vue}'],
    ignores: ['app/composables/useT.ts'],
    rules: { 'no-restricted-syntax': ['error', ...noStringLiteralCompare, ...untypedI18n] },
  },
  {
    files: ['app/**/*.vue'],
    rules: { 'vue/no-restricted-syntax': ['error', ...noStringLiteralCompare, noNestedTernaryInTemplate, ...untypedI18n] },
  },
  {
    // Nuxt names pages and layouts by file, so single-word names are expected there.
    files: ['app/pages/**/*.vue', 'app/layouts/**/*.vue', 'app/app.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
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
