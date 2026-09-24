import type { Intent } from './intent.ts';
import type { Locale } from './locale.ts';

/** Major.minor of the message envelope (SPEC.md §B5). Consumers reject a different major. */
export const ENVELOPE_VERSION = '0.1' as const;

/** Every event/message between web, engine and AI service. Unknown fields are ignored. */
export interface Envelope<T extends string = string, P = Record<string, unknown>> {
  v: string;
  type: T;
  id: string;
  sessionId?: string;
  chunkId?: string;
  seq?: number;
  requestId?: string;
  /** Monotonic milliseconds. */
  t: number;
  payload: P;
}

/** One spoken word: audio time in ms from audio start, text range in UTF-16 code units. */
export interface WordTiming {
  index: number;
  start: number;
  end: number;
  charStart: number;
  charEnd: number;
}

/** Where word timings came from (SPEC.md §B7 highlight tiers). `none` means chunk highlight only. */
export const TimingSource = {
  Provider: 'provider',
  BoundaryEvent: 'boundary-event',
  None: 'none',
} as const;
export type TimingSource = (typeof TimingSource)[keyof typeof TimingSource];

export interface TtsResult {
  audioUrl: string;
  durationMs: number;
  /** Null exactly when `timingSource` is `none`: no fake word-level highlighting (SPEC.md §A6.4). */
  timings: WordTiming[] | null;
  timingSource: TimingSource;
  cacheKey: string;
}

export interface TextSpan {
  charStart: number;
  charEnd: number;
}

export const MatchDecision = {
  Advance: 'advance',
  Ask: 'ask',
} as const;
export type MatchDecision = (typeof MatchDecision)[keyof typeof MatchDecision];

export interface MatchResult {
  coverage: number;
  similarity: number;
  missingSpans: TextSpan[];
  decision: MatchDecision;
  reasons: string[];
}

export const CommandSource = {
  Voice: 'voice',
  Touch: 'touch',
  Keyboard: 'keyboard',
} as const;
export type CommandSource = (typeof CommandSource)[keyof typeof CommandSource];

export interface CommandEvent {
  intent: Intent;
  args?: Record<string, string>;
  source: CommandSource;
  utterance?: string;
  confidence?: number;
}

/** The spoken command grammar for one locale (SPEC.md §B5). `{target}` is the only placeholder. */
export interface CommandGrammar {
  locale: Locale;
  intents: Record<Intent, string[]>;
}

export const GRAMMAR_PLACEHOLDERS = ['{target}'] as const;
