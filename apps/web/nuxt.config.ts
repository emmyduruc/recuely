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
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  telemetry: false,
  typescript: {
    strict: true,
    tsConfig: { compilerOptions: strictCompilerOptions },
    nodeTsConfig: { compilerOptions: strictCompilerOptions, include: ['../test/**/*', '../vitest.config.ts', '../vitest.int.config.ts'] },
  },
  nitro: {
    typescript: { tsConfig: { compilerOptions: strictCompilerOptions } },
    // Workspace packages ship TS source, so they are bundled; TypeORM and pg stay external
    // and are traced into .output/server/node_modules (SPEC.md §B2, H-20).
    externals: { inline: ['@repo/contracts', '@repo/db'], external: ['typeorm', 'pg'] },
  },
});
