import { DEFAULT_LOCALE, Locale, Theme } from '@repo/contracts';

const strictCompilerOptions = {
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
};

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  // Design tokens + shared status components (SPEC.md §B9, packages/ui).
  extends: ['../../packages/ui'],
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  telemetry: false,
  // Studio dark by default (SPEC.md §B9); the user can switch to light.
  colorMode: { preference: Theme.Dark, fallback: Theme.Dark },
  // Icons are served from the bundled Lucide set by this server, never fetched from a third party.
  icon: { serverBundle: 'local', fallbackToApi: false },
  // UI text from i18n/locales (SPEC.md §B11). R1 is English only; no locale in URLs.
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: DEFAULT_LOCALE,
    locales: [{ code: Locale.En, language: 'en-US', file: 'en.json' }],
    detectBrowserLanguage: false,
  },
  runtimeConfig: {
    // NUXT_PUBLIC_DESIGN_PAGE_ENABLED: the dev-only /_design page (on in `nuxt dev`).
    public: { designPageEnabled: false },
  },
  $development: { runtimeConfig: { public: { designPageEnabled: true } } },
  typescript: {
    strict: true,
    tsConfig: { compilerOptions: strictCompilerOptions },
    nodeTsConfig: { compilerOptions: strictCompilerOptions, include: ['../test/**/*', '../vitest.config.ts', '../vitest.int.config.ts'] },
  },
  nitro: {
    typescript: { tsConfig: { compilerOptions: strictCompilerOptions } },
    // Workspace packages ship TS source, so they are bundled; TypeORM and pg stay external
    // and are traced into .output/server/node_modules (SPEC.md §B2, H-20).
    externals: { inline: ['@repo/contracts', '@repo/db', '@repo/script-model'], external: ['typeorm', 'pg'] },
  },
});
