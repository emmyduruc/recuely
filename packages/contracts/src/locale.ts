/** UI locales (SPEC.md §B11). R1 is English only. */
export const Locale = {
  En: 'en',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];

export const DEFAULT_LOCALE: Locale = Locale.En;
