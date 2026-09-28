// WCAG 2.2 contrast checks over the design tokens (SPEC.md §B9: WCAG 2.2 AA).

export const ThemeBlock = {
  Dark: 'dark',
  Light: 'light',
} as const;
export type ThemeBlock = (typeof ThemeBlock)[keyof typeof ThemeBlock];

/** Minimum ratios: 4.5 for text, 3 for non-text UI such as focus rings (WCAG 1.4.3, 1.4.11). */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_UI_CONTRAST = 3;

export interface ContrastPair {
  fg: string;
  bg: string;
  min: number;
}

const SURFACES = ['canvas', 'surface-1', 'surface-2'] as const;
const TEXT_ROLES = ['text', 'text-muted', 'text-subtle'] as const;
const TONES = ['accent', 'success', 'warning', 'error', 'live', 'listening', 'assistant'] as const;

/** Every foreground/background pair the components use. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...TEXT_ROLES.flatMap((fg) => SURFACES.map((bg) => ({ fg, bg, min: MIN_TEXT_CONTRAST }))),
  ...TONES.flatMap((fg) => SURFACES.map((bg) => ({ fg, bg, min: MIN_TEXT_CONTRAST }))),
  { fg: 'on-accent', bg: 'accent', min: MIN_TEXT_CONTRAST },
  { fg: 'on-live', bg: 'live-solid', min: MIN_TEXT_CONTRAST },
  { fg: 'hl-current-fg', bg: 'hl-current-bg', min: MIN_TEXT_CONTRAST },
  ...SURFACES.flatMap((bg) => [
    { fg: 'hl-spoken', bg, min: MIN_TEXT_CONTRAST },
    { fg: 'hl-upcoming', bg, min: MIN_TEXT_CONTRAST },
    { fg: 'focus', bg, min: MIN_UI_CONTRAST },
    { fg: 'border-strong', bg, min: MIN_UI_CONTRAST },
  ]),
];

const HEX = /^#([0-9a-f]{6})$/i;

/** Reads `--rc-*: #rrggbb` declarations of the dark (`:root, .dark`) and `.light` blocks. */
export function parseThemeTokens(css: string): Record<ThemeBlock, Map<string, string>> {
  const result: Record<ThemeBlock, Map<string, string>> = { [ThemeBlock.Dark]: new Map(), [ThemeBlock.Light]: new Map() };
  const blocks = css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, selector = '', body = ''] of blocks) {
    const selectors = selector.split(',').map((s) => s.trim());
    const target = Object.values(ThemeBlock).find((theme) => selectors.includes(`.${theme}`));
    if (target === undefined) continue;
    for (const [, name = '', value = ''] of body.matchAll(/--rc-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      result[target].set(name, value.trim());
    }
  }
  return result;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = HEX.exec(hex);
  if (match?.[1] === undefined) throw new Error(`Not a #rrggbb color: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return 0.2126 * channel((n >> 16) & 0xff) + 0.7152 * channel((n >> 8) & 0xff) + 0.0722 * channel(n & 0xff);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}
