import {
  type CommandAliases,
  type CommandEvent,
  type CommandGrammar,
  CommandSource,
  GRAMMAR_PLACEHOLDERS,
  Intent,
  type SpeechGate,
} from '@repo/contracts';
import { containment } from './align.ts';
import { matchTokens } from './normalize.ts';

// Grammar matcher (SPEC.md §B5 table → CommandEvent | null). A command must be the *whole* utterance (after
// trimming fillers like "um" or "okay"), matching one phrase exactly: "next" is a command, "Next, we repeat the
// process" is not. User aliases only add phrases; they can never take over a built-in phrase, so PAUSE can't
// be lost (product brief §5).

const [TARGET] = GRAMMAR_PLACEHOLDERS;
const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'hmm', 'okay', 'ok', 'please', 'hey']);

interface Phrase {
  intent: Intent;
  words: readonly string[];
  hasTarget: boolean;
  source: string;
}

export interface CompiledGrammar {
  phrases: readonly Phrase[];
  /** Alias phrases that were dropped because a built-in phrase already means something else. */
  rejectedAliases: readonly { intent: Intent; phrase: string }[];
}

function compilePhrase(intent: Intent, phrase: string): Phrase | null {
  const hasTarget = phrase.endsWith(TARGET);
  const words = matchTokens(hasTarget ? phrase.slice(0, -TARGET.length) : phrase).map((token) => token.text);
  return words.length === 0 ? null : { intent, words, hasTarget, source: phrase };
}

const key = (phrase: Phrase): string => `${phrase.hasTarget ? '+' : ''}${phrase.words.join(' ')}`;

/** Normalizes the grammar (and aliases) once; longer phrases are tried first. */
export function compileGrammar(grammar: CommandGrammar, aliases: CommandAliases = {}): CompiledGrammar {
  const phrases: Phrase[] = [];
  const owner = new Map<string, Intent>();
  for (const intent of Object.values(Intent)) {
    for (const phrase of grammar.intents[intent]) {
      const compiled = compilePhrase(intent, phrase);
      if (compiled !== null) {
        phrases.push(compiled);
        owner.set(key(compiled), intent);
      }
    }
  }
  const rejectedAliases: { intent: Intent; phrase: string }[] = [];
  for (const intent of Object.values(Intent)) {
    for (const phrase of aliases[intent] ?? []) {
      const compiled = compilePhrase(intent, phrase);
      const taken = compiled === null ? undefined : owner.get(key(compiled));
      if (compiled === null || (taken !== undefined && taken !== intent)) {
        rejectedAliases.push({ intent, phrase });
      } else if (taken === undefined) {
        phrases.push(compiled);
        owner.set(key(compiled), intent);
      }
    }
  }
  phrases.sort((a, b) => b.words.length - a.words.length || Number(a.hasTarget) - Number(b.hasTarget));
  return { phrases, rejectedAliases };
}

function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((word, index) => word === b[index]);
}

/** The command an utterance is, or null. `{target}` phrases need at least one word after the prefix. */
export function matchCommand(utterance: string, grammar: CompiledGrammar): CommandEvent | null {
  const tokens = matchTokens(utterance);
  let first = 0;
  let last = tokens.length;
  while (first < last && FILLERS.has(tokens[first]?.text ?? '')) {
    first += 1;
  }
  while (last > first && FILLERS.has(tokens[last - 1]?.text ?? '')) {
    last -= 1;
  }
  const words = tokens.slice(first, last).map((token) => token.text);
  for (const phrase of grammar.phrases) {
    if (!phrase.hasTarget && sameWords(words, phrase.words)) {
      return { intent: phrase.intent, source: CommandSource.Voice, utterance };
    }
    const rest = tokens.slice(first + phrase.words.length, last);
    const firstRest = rest[0];
    const lastRest = rest.at(-1);
    if (phrase.hasTarget && firstRest !== undefined && lastRest !== undefined && sameWords(words.slice(0, phrase.words.length), phrase.words)) {
      return {
        intent: phrase.intent,
        source: CommandSource.Voice,
        utterance,
        args: { target: utterance.slice(firstRest.start, lastRest.end) },
      };
    }
  }
  return null;
}

export const UtteranceKind = {
  Command: 'command',
  /** Words of the script (possibly including a command word, like "Next, we repeat…"). */
  ScriptSpeech: 'script_speech',
  Unrecognized: 'unrecognized',
} as const;
export type UtteranceKind = (typeof UtteranceKind)[keyof typeof UtteranceKind];

/** At or above this similarity to the remaining chunk text, an utterance is script speech (SPEC.md §B6 ✓*). */
export const SCRIPT_SPEECH_SIMILARITY = 0.5;

export interface Classification {
  kind: UtteranceKind;
  command: CommandEvent | null;
  /** What the session engine needs to accept a voice command during creator speech. */
  speechGate: SpeechGate;
}

/**
 * Command vs script speech. A command must match the grammar exactly *and* not be the script itself: if the
 * remaining chunk text contains the utterance (similarity ≥ 0.5), it's the creator reading, not commanding.
 */
export function classifyUtterance(input: {
  utterance: string;
  durationMs: number;
  remainingChunkText: string;
  grammar: CompiledGrammar;
}): Classification {
  const command = matchCommand(input.utterance, input.grammar);
  const chunkSimilarity = containment(input.remainingChunkText, input.utterance);
  const speechGate = { durationMs: input.durationMs, exactGrammarMatch: command !== null, chunkSimilarity };
  if (chunkSimilarity >= SCRIPT_SPEECH_SIMILARITY) {
    return { kind: UtteranceKind.ScriptSpeech, command: null, speechGate };
  }
  return command === null
    ? { kind: UtteranceKind.Unrecognized, command: null, speechGate }
    : { kind: UtteranceKind.Command, command, speechGate };
}
