import { DEFAULT_MATCH_THRESHOLDS, type MatchThresholds } from '@repo/contracts';

export { alignWords, containment, END_TOLERANCE, matchTranscript, wordsMatch } from './align.ts';
export {
  classifyUtterance,
  type Classification,
  compileGrammar,
  type CompiledGrammar,
  matchCommand,
  SCRIPT_SPEECH_SIMILARITY,
  UtteranceKind,
} from './grammar.ts';
export { type MatchToken, matchTokens, matchWords } from './normalize.ts';
export { integerWords, numberTokenWords, ordinalWords } from './numbers.ts';

/** The user's thresholds (UserSettings.matchThresholds), or the §B7 defaults when none are stored. */
export function thresholdsFrom(settings: { matchThresholds?: MatchThresholds | null } | null | undefined): MatchThresholds {
  return settings?.matchThresholds ?? DEFAULT_MATCH_THRESHOLDS;
}
