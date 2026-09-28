// Locale file rules (SPEC.md §B11): snake_case key segments and placeholders, non-empty string
// values, and, once more than one locale exists, the same keys and placeholders as en.json.

export const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const PLACEHOLDER = /\{([^{}]*)\}/g;

/** Flattens a locale object to `dotted.key → value`, reporting non-string leaves. */
function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix.length === 0 ? key : `${prefix}.${key}`, out);
    return;
  }
  out.set(prefix, value);
}

function placeholders(message: string): string[] {
  return [...message.matchAll(PLACEHOLDER)].map((m) => m[1] ?? '').sort();
}

/** Returns human-readable problems; empty means every file passes. */
export function checkLocales(files: Record<string, unknown>, reference = 'en'): string[] {
  const problems: string[] = [];
  const flat = new Map<string, Map<string, unknown>>();
  for (const [locale, content] of Object.entries(files)) {
    const entries = new Map<string, unknown>();
    flatten(content, '', entries);
    flat.set(locale, entries);
    for (const [key, value] of entries) {
      for (const segment of key.split('.')) {
        if (!SNAKE_CASE.test(segment)) problems.push(`${locale}: key segment "${segment}" in "${key}" is not snake_case`);
      }
      if (typeof value !== 'string') {
        problems.push(`${locale}: "${key}" is not a string`);
        continue;
      }
      if (value.trim().length === 0) problems.push(`${locale}: "${key}" is empty`);
      for (const name of placeholders(value)) {
        if (!SNAKE_CASE.test(name)) problems.push(`${locale}: placeholder {${name}} in "${key}" is not snake_case`);
      }
    }
  }
  const base = flat.get(reference);
  if (base === undefined) return [...problems, `missing reference locale "${reference}"`];
  for (const [locale, entries] of flat) {
    if (locale === reference) continue;
    for (const key of base.keys()) if (!entries.has(key)) problems.push(`${locale}: missing key "${key}"`);
    for (const [key, value] of entries) {
      const expected = base.get(key);
      if (expected === undefined) {
        problems.push(`${locale}: extra key "${key}"`);
      } else if (typeof value === 'string' && typeof expected === 'string' && placeholders(value).join() !== placeholders(expected).join()) {
        problems.push(`${locale}: placeholders of "${key}" differ from ${reference}`);
      }
    }
  }
  return problems;
}
