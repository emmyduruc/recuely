// Lets ESLint's TypeScript service (which can't read SFCs) type `.vue` imports in tests.
// vue-tsc resolves the real component types and ignores this wildcard.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>>;
  export default component;
}
