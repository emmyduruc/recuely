// Shared ESLint flat config implementing SPEC.md §B10 (code standards) and §B3 (boundaries).
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const STRING_LITERAL_MESSAGE =
  'Compare against a named constant (e.g. SessionState.Paused), not a string literal. See SPEC.md §B10 R3.';

// R3 — no comparisons against raw string literals (typeof checks are allowed).
export const noStringLiteralCompare = [
  {
    selector: "BinaryExpression[operator=/^[!=]==?$/][left.type!='UnaryExpression'] > Literal[raw=/^['\"]/]",
    message: STRING_LITERAL_MESSAGE,
  },
  {
    selector: 'BinaryExpression[operator=/^[!=]==?$/] > TemplateLiteral[expressions.length=0]',
    message: STRING_LITERAL_MESSAGE,
  },
  {
    selector: "SwitchCase > Literal[raw=/^['\"]/]",
    message: 'Use named constants in case labels, not string literals. See SPEC.md §B10 R3.',
  },
];

// R4 — no nested ternaries (templates need an explicit selector).
export const noNestedTernaryInTemplate = {
  selector: 'ConditionalExpression > ConditionalExpression',
  message: 'Nested ternaries are not allowed; use a Record lookup. See SPEC.md §B10 R4.',
};

const standards = {
  'no-nested-ternary': 'error',
  'no-restricted-syntax': ['error', ...noStringLiteralCompare],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/ban-ts-comment': [
    'error',
    { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true, 'ts-nocheck': true, minimumDescriptionLength: 10 },
  ],
  '@typescript-eslint/consistent-type-imports': 'error',
};

/**
 * @param {object} options
 * @param {string} options.tsconfigRootDir  absolute dir of the package (import.meta.dirname)
 * @param {boolean} [options.vue]            enable Vue SFC linting
 * @param {string[]} [options.restrictedImports] module names this package must not import
 * @param {string[]} [options.ignores]
 */
export function createConfig({ tsconfigRootDir, vue = false, restrictedImports = [], ignores = [] }) {
  const restricted =
    restrictedImports.length > 0
      ? [
          {
            rules: {
              'no-restricted-imports': [
                'error',
                {
                  patterns: restrictedImports.map((name) => ({
                    group: [name, `${name}/*`],
                    message: `This package must not import "${name}" (SPEC.md §B3 boundaries).`,
                  })),
                },
              ],
            },
          },
        ]
      : [];

  return tseslint.config(
    { ignores: ['**/dist/**', '**/.nuxt/**', '**/.output/**', '**/coverage/**', '**/node_modules/**', ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...(vue ? pluginVue.configs['flat/recommended'] : []),
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
          ...(vue ? { parser: tseslint.parser, extraFileExtensions: ['.vue'] } : {}),
        },
      },
      rules: standards,
    },
    ...(vue
      ? [
          {
            files: ['**/*.vue'],
            languageOptions: { globals: { ...globals.browser } },
            rules: {
              // Nuxt auto-imports; vue-tsc reports anything truly undefined (typescript-eslint guidance).
              'no-undef': 'off',
              'vue/no-restricted-syntax': ['error', ...noStringLiteralCompare, noNestedTernaryInTemplate],
              // R5 — no hard-coded user-facing text; copy comes from the locale files (SPEC.md §B11).
              'vue/no-bare-strings-in-template': 'error',
            },
          },
        ]
      : []),
    {
      files: ['**/*.js', '**/*.mjs'],
      ...tseslint.configs.disableTypeChecked,
    },
    ...restricted,
  );
}
