/** Color theme (SPEC.md §B9): studio dark by default, plus light, or follow the OS. */
export const Theme = {
  Dark: 'dark',
  Light: 'light',
  System: 'system',
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

export const DEFAULT_THEME: Theme = Theme.Dark;
