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
    nodeTsConfig: { compilerOptions: strictCompilerOptions, include: ['../test/**/*'] },
  },
  nitro: {
    typescript: { tsConfig: { compilerOptions: strictCompilerOptions } },
  },
});
