import { Intent } from './intent.ts';

/**
 * Assistant highlight tiers (SPEC.md §B7), best first. `chunk` renders no word-level markers:
 * word highlighting only exists where real timings do (§A6.4).
 */
export const HighlightTier = {
  WordProvider: 'word-provider',
  WordApprox: 'word-approx',
  Chunk: 'chunk',
} as const;
export type HighlightTier = (typeof HighlightTier)[keyof typeof HighlightTier];

/** Position of a word (or chunk) relative to the reading position. */
export const ReadingState = {
  Spoken: 'spoken',
  Current: 'current',
  Upcoming: 'upcoming',
} as const;
export type ReadingState = (typeof ReadingState)[keyof typeof ReadingState];

/** Semantic tones of the status language (SPEC.md §B9); each maps to one color token. */
export const StatusTone = {
  Neutral: 'neutral',
  Accent: 'accent',
  Assistant: 'assistant',
  Listening: 'listening',
  Live: 'live',
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
} as const;
export type StatusTone = (typeof StatusTone)[keyof typeof StatusTone];

/** What the capture indicator shows: devices off, mic armed (not recording), or recording a take. */
export const CaptureState = {
  Off: 'off',
  Listening: 'listening',
  Recording: 'recording',
} as const;
export type CaptureState = (typeof CaptureState)[keyof typeof CaptureState];

/** The choices of the decision bar after a take (SPEC.md §B9 "Next · Repeat · Retake"). */
export const DecisionAction = {
  Next: Intent.Next,
  Repeat: Intent.Repeat,
  Retake: Intent.Retake,
} as const;
export type DecisionAction = (typeof DecisionAction)[keyof typeof DecisionAction];
