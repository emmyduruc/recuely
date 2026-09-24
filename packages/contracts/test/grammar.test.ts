import { describe, expect, it } from 'vitest';
import { GRAMMAR_PLACEHOLDERS, Intent } from '../src/index.ts';
import { ContractType } from '../src/schemas/index.ts';
import { validateContract } from '../src/validation.ts';
import { readJson } from './fixtures.ts';

const result = validateContract(ContractType.CommandGrammar, readJson('grammar/en.json'));

describe('T2: command grammar (en)', () => {
  it('T2: validates against the CommandGrammar schema', () => {
    expect(result.ok).toBe(true);
  });

  it('T2: every intent has phrases and no phrase belongs to two intents', () => {
    if (!result.ok) {
      throw new Error('grammar is invalid');
    }
    const owner = new Map<string, Intent>();
    for (const intent of Object.values(Intent)) {
      const phrases = result.value.intents[intent];
      expect(phrases.length, intent).toBeGreaterThan(0);
      for (const phrase of phrases) {
        expect(owner.get(phrase), `"${phrase}"`).toBeUndefined();
        owner.set(phrase, intent);
      }
    }
  });

  it('T2: only NAVIGATE uses the {target} placeholder, in every phrase', () => {
    if (!result.ok) {
      throw new Error('grammar is invalid');
    }
    for (const [intent, phrases] of Object.entries(result.value.intents)) {
      const usesTarget = phrases.map((phrase) => GRAMMAR_PLACEHOLDERS.some((p) => phrase.includes(p)));
      expect(usesTarget.every(Boolean) || !usesTarget.some(Boolean), intent).toBe(true);
      expect(usesTarget.some(Boolean), intent).toBe(intent === Intent.Navigate);
    }
  });

  it('T2: "stop" means PAUSE (ending a session is a confirmed button, SPEC.md §B5)', () => {
    expect(result.ok && result.value.intents[Intent.Pause]).toContain('stop');
  });
});
