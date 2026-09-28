import { readFileSync } from 'node:fs';
import {
  type CommandGrammar,
  ContractType,
  DEFAULT_MATCH_THRESHOLDS,
  Intent,
  MatchDecision,
  type MatchThresholds,
} from '@repo/contracts';
import { validateContract } from '@repo/contracts/validation';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  classifyUtterance,
  compileGrammar,
  integerWords,
  matchCommand,
  matchTokens,
  matchTranscript,
  matchWords,
  ordinalWords,
  thresholdsFrom,
  UtteranceKind,
} from '../src/index.ts';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

const grammarResult = validateContract(ContractType.CommandGrammar, readJson('../../contracts/fixtures/grammar/en.json'));
if (!grammarResult.ok) {
  throw new Error('en grammar fixture is invalid');
}
const grammar: CommandGrammar = grammarResult.value;
const compiled = compileGrammar(grammar);

interface CommandFixtures {
  commands: { utterance: string; intent: Intent; args?: Record<string, string> }[];
  nearMisses: string[];
  classification: { utterance: string; remainingChunkText: string; kind: string; intent?: Intent }[];
}

interface TranscriptFixtures {
  thresholds: MatchThresholds;
  cases: { name: string; chunk: string; transcript: string; decision: MatchDecision; missing?: string[]; reasonsInclude?: string[] }[];
}

const commandFixtures = readJson('../../../tests/fixtures/matching/commands.json') as CommandFixtures;
const transcriptFixtures = readJson('../../../tests/fixtures/matching/transcripts.json') as TranscriptFixtures;

describe('T6: normalizer', () => {
  it('T6: case, punctuation, accents, contractions and numbers', () => {
    expect(matchWords("Today, we're NOT done — it's 3.5% of 1,000 (café)!")).toEqual([
      'today', 'we', 'are', 'not', 'done', 'it', 'is', 'three', 'point', 'five', 'percent', 'of', 'one', 'thousand', 'cafe',
    ]);
    expect(matchWords("Ada's 2nd video & 21st take, well-known")).toEqual(['adas', 'second', 'video', 'and', 'twenty', 'first', 'take', 'well', 'known']);
  });

  it('T6: every token points back at its source word (UTF-16)', () => {
    const text = "Hi 👋🏽 we're here";
    for (const token of matchTokens(text)) {
      expect(text.slice(token.start, token.end).length).toBeGreaterThan(0);
    }
    // "we're" expands to two tokens that both point at the source word.
    const start = text.indexOf("we're");
    expect(matchTokens(text).filter((t) => t.start === start)).toEqual([
      { text: 'we', start, end: start + 5 },
      { text: 'are', start, end: start + 5 },
    ]);
  });

  it('T6: integers and ordinals spell out', () => {
    expect(integerWords(0)).toEqual(['zero']);
    expect(integerWords(1_005)).toEqual(['one', 'thousand', 'five']);
    expect(integerWords(2_300_014)).toEqual(['two', 'million', 'three', 'hundred', 'thousand', 'fourteen']);
    expect(ordinalWords(40)).toEqual(['fortieth']);
    expect(ordinalWords(12)).toEqual(['twelfth']);
  });
});

describe('T6: grammar matcher', () => {
  for (const intent of Object.values(Intent)) {
    for (const phrase of grammar.intents[intent]) {
      const utterance = phrase.replace('{target}', 'the intro');
      it(`T6: "${utterance}" → ${intent}`, () => {
        expect(matchCommand(utterance, compiled)?.intent).toBe(intent);
      });
    }
  }

  for (const { utterance, intent, args } of commandFixtures.commands) {
    it(`T6: variant "${utterance}" → ${intent}`, () => {
      const command = matchCommand(utterance, compiled);
      expect(command).toMatchObject({ intent, source: 'voice', utterance, ...(args === undefined ? {} : { args }) });
      expect(validateContract(ContractType.CommandEvent, command).ok).toBe(true);
    });
  }

  for (const utterance of commandFixtures.nearMisses) {
    it(`T6: near-miss "${utterance}" → no command`, () => {
      expect(matchCommand(utterance, compiled)).toBeNull();
    });
  }

  it('T6: aliases add phrases but can never take over another command (PAUSE is safe)', () => {
    const withAliases = compileGrammar(grammar, { [Intent.Next]: ['onward', 'pause'], [Intent.Pause]: ['freeze'] });
    expect(matchCommand('onward', withAliases)?.intent).toBe(Intent.Next);
    expect(matchCommand('freeze', withAliases)?.intent).toBe(Intent.Pause);
    expect(matchCommand('pause', withAliases)?.intent).toBe(Intent.Pause);
    expect(withAliases.rejectedAliases).toEqual([{ intent: Intent.Next, phrase: 'pause' }]);
  });
});

describe('T6: command vs script speech', () => {
  for (const { utterance, remainingChunkText, kind, intent } of commandFixtures.classification) {
    it(`T6: "${utterance}" with "${remainingChunkText}" → ${kind}`, () => {
      const result = classifyUtterance({ utterance, durationMs: 900, remainingChunkText, grammar: compiled });
      expect(result.kind).toBe(kind);
      expect(result.command?.intent).toBe(intent);
      expect(result.speechGate.durationMs).toBe(900);
    });
  }

  it('T6: "Next, we repeat the process" spoken as script speech is never a command', () => {
    const result = classifyUtterance({
      utterance: 'Next, we repeat the process',
      durationMs: 1800,
      remainingChunkText: 'Next, we repeat the process until the wood shines.',
      grammar: compiled,
    });
    expect(result).toMatchObject({ kind: UtteranceKind.ScriptSpeech, command: null, speechGate: { exactGrammarMatch: false, chunkSimilarity: 1 } });
  });
});

describe('T6: transcript matcher', () => {
  for (const test of transcriptFixtures.cases) {
    it(`T6: ${test.name} → ${test.decision}`, () => {
      const result = matchTranscript(test.chunk, test.transcript, transcriptFixtures.thresholds);
      expect(result.decision, result.reasons.join('; ')).toBe(test.decision);
      expect(validateContract(ContractType.MatchResult, result).ok).toBe(true);
      if (test.missing !== undefined) {
        expect(result.missingSpans.map((span) => test.chunk.slice(span.charStart, span.charEnd))).toEqual(test.missing);
      }
      for (const reason of test.reasonsInclude ?? []) {
        expect(result.reasons).toContain(reason);
      }
    });
  }

  it('T6: thresholds come from settings: the same take can advance or ask depending on them', () => {
    const chunk = 'Hi, I am Ada.';
    const rambling = 'hi i am ada and let me also tell you about my channel';
    expect(matchTranscript(chunk, rambling, thresholdsFrom({ matchThresholds: DEFAULT_MATCH_THRESHOLDS })).decision).toBe(MatchDecision.Ask);
    expect(matchTranscript(chunk, rambling, thresholdsFrom({ matchThresholds: { coverage: 0.8, similarity: 0.3 } })).decision).toBe(MatchDecision.Advance);
    expect(thresholdsFrom(null)).toEqual(DEFAULT_MATCH_THRESHOLDS);
    expect(thresholdsFrom({ matchThresholds: null })).toEqual(DEFAULT_MATCH_THRESHOLDS);
  });

  it('T6: reasons explain each check', () => {
    expect(matchTranscript('Thanks for watching.', 'thanks for watching', DEFAULT_MATCH_THRESHOLDS).reasons).toEqual([
      'coverage 1.00 ≥ 0.80',
      'similarity 1.00 ≥ 0.70',
      'ending heard',
    ]);
  });

  it('T6-P: reading the chunk itself always advances; silence never does (1,000 cases)', () => {
    const word = fc.constantFrom('the', 'shelf', 'wooden', 'Dr.', 'three', '3', "we're", 'café', 'build', 'corner', '**bold**', 'room,');
    const chunk = fc.array(word, { minLength: 1, maxLength: 20 }).map((words) => words.join(' '));
    fc.assert(
      fc.property(chunk, (text) => {
        expect(matchTranscript(text, text, DEFAULT_MATCH_THRESHOLDS).decision).toBe(MatchDecision.Advance);
        expect(matchTranscript(text, '', DEFAULT_MATCH_THRESHOLDS).decision).toBe(MatchDecision.Ask);
        const result = matchTranscript(text, text.split(' ').slice(0, 1).join(' '), DEFAULT_MATCH_THRESHOLDS);
        for (const span of result.missingSpans) {
          expect(span.charStart).toBeLessThan(span.charEnd);
          expect(span.charEnd).toBeLessThanOrEqual(text.length);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
