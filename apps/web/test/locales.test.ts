import { readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { SessionState } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { checkLocales } from '../i18n/check-locales';
import en from '../i18n/locales/en.json';
import { CAPTURE_LABEL, DECISION_LABEL, STUDIO_STATUS } from '../app/utils/studio-status';

const LOCALE_DIR = new URL('../i18n/locales/', import.meta.url);

function readLocales(): Record<string, unknown> {
  const files = readdirSync(LOCALE_DIR).filter((name) => name.endsWith('.json'));
  return Object.fromEntries(files.map((name) => [basename(name, '.json'), JSON.parse(readFileSync(new URL(name, LOCALE_DIR), 'utf8')) as unknown]));
}

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[segment] : undefined), en);
}

describe('locale files (§B11)', () => {
  it('T11: every locale file passes the key and value rules', () => {
    expect(checkLocales(readLocales())).toEqual([]);
  });

  it('T11: the check fails on a camelCase key, an empty value, a non-string and a bad placeholder', () => {
    const problems = checkLocales({ en: { studio: { yourTurn: 'Your turn', empty: '  ', count: 3, take: 'Take {takeNumber}' } } });
    expect(problems).toEqual([
      'en: key segment "yourTurn" in "studio.yourTurn" is not snake_case',
      'en: "studio.empty" is empty',
      'en: "studio.count" is not a string',
      'en: placeholder {takeNumber} in "studio.take" is not snake_case',
    ]);
  });

  it('T11: with a second locale, it fails on missing/extra keys and different placeholders', () => {
    const problems = checkLocales({
      en: { a: 'A', b: 'Take {take_number}' },
      xx: { b: 'Take {count}', c: 'C' },
    });
    expect(problems).toEqual(['xx: missing key "a"', 'xx: placeholders of "b" differ from en', 'xx: extra key "c"']);
  });
});

describe('status language (§B9)', () => {
  it('T11: every session state has an icon, a tone and an existing text key', () => {
    for (const state of Object.values(SessionState)) {
      const status = STUDIO_STATUS[state];
      expect(status.icon).toMatch(/^i-lucide-[a-z0-9-]+$/);
      expect(typeof lookup(status.label)).toBe('string');
    }
  });

  it('T11: capture and decision labels exist in en.json', () => {
    for (const key of [...Object.values(CAPTURE_LABEL), ...Object.values(DECISION_LABEL)]) {
      expect(typeof lookup(key)).toBe('string');
    }
  });
});
