// Typed translation keys (SPEC.md §B11): every dotted path to a string in en.json.
import type en from '../../i18n/locales/en.json';

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof en>;

export type MessageParams = Record<string, string | number>;
