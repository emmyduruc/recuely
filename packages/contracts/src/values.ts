/** Type guard for a value of a `const` object (SPEC.md §B10 R3), e.g. `isValueOf(Locale, input)`. */
export function isValueOf<T extends Readonly<Record<string, string>>>(values: T, input: unknown): input is T[keyof T] {
  return typeof input === 'string' && Object.values(values).some((value) => value === input);
}
