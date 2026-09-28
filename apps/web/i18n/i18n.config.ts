// vue-i18n options (SPEC.md §B11). A missing key is logged as an error in every environment,
// and the E2E tests fail on any console error.
import { DEFAULT_LOCALE } from '@repo/contracts';

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: DEFAULT_LOCALE,
  missingWarn: false,
  fallbackWarn: false,
  missing: (locale: string, key: string) => {
    console.error(`[i18n] Missing key "${key}" for locale "${locale}"`);
    return key;
  },
}));
