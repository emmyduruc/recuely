import { describe, expect, it } from 'vitest';
import { ContractType } from '../src/schemas/index.ts';
import { validateContract } from '../src/validation.ts';
import { loadContractFixtures } from './fixtures.ts';

const fixtures = loadContractFixtures();

describe('T2: shared contract fixtures (TS side)', () => {
  it('T2: there is a fixture file for every contract, each with valid and invalid cases', () => {
    expect(fixtures.map((f) => f.type).sort()).toEqual(Object.values(ContractType).sort());
    for (const fixture of fixtures) {
      expect(fixture.valid.length, fixture.type).toBeGreaterThan(0);
      expect(fixture.invalid.length, fixture.type).toBeGreaterThan(0);
    }
  });

  for (const fixture of fixtures) {
    describe(fixture.type, () => {
      for (const valid of fixture.valid) {
        it(`T2: accepts "${valid.name}"`, () => {
          expect(validateContract(fixture.type, valid.value)).toEqual({ ok: true, value: valid.value });
        });
      }
      for (const invalid of fixture.invalid) {
        it(`T2: rejects "${invalid.name}" at ${invalid.path ?? '?'}`, () => {
          const result = validateContract(fixture.type, invalid.value);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.issues.map((issue) => issue.path)).toContain(invalid.path);
          }
        });
      }
    });
  }
});

describe('validation messages', () => {
  it('T2: unknown fields, missing fields and enums read well', () => {
    expect(validateContract(ContractType.UpdateSettingsRequest, { theme: 'neon', extra: 1 })).toEqual({
      ok: false,
      issues: [
        { path: 'extra', issue: 'unknown field' },
        { path: 'theme', issue: 'must be one of: dark, light, system' },
      ],
    });
    expect(validateContract(ContractType.AddVoiceFavoriteRequest, { provider: 'kokoro' })).toEqual({
      ok: false,
      issues: [
        { path: 'voiceId', issue: 'is required' },
        { path: 'label', issue: 'is required' },
      ],
    });
  });
});
