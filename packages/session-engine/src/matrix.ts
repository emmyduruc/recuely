import { Arrangement, CommandSource, type CommandEvent, Intent, SessionState } from '@repo/contracts';
import type { SpeechGate } from './types.ts';

// Command permission matrix (SPEC.md §B6). ✓ Accept · ✗ Ignore · T touch/keyboard only · ✓* isolated voice.

export const Permission = {
  Accept: 'accept',
  Ignore: 'ignore',
  TouchOnly: 'touch_only',
  /** Voice only as a separate short utterance that doesn't match the chunk text; touch always works. */
  IsolatedVoice: 'isolated_voice',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const MatrixColumn = {
  Ready: 'ready',
  SpeakingSpeaker: 'speaking_speaker',
  SpeakingHeadset: 'speaking_headset',
  Settle: 'settle',
  Waiting: 'waiting',
  CreatorSpeaking: 'creator_speaking',
  Evaluating: 'evaluating',
  Review: 'review',
  Paused: 'paused',
} as const;
export type MatrixColumn = (typeof MatrixColumn)[keyof typeof MatrixColumn];

export const MatrixRow = {
  StartContinue: 'start_continue',
  Pause: 'pause',
  Repeat: 'repeat',
  Retake: 'retake',
  Navigation: 'navigation',
  Utility: 'utility',
} as const;
export type MatrixRow = (typeof MatrixRow)[keyof typeof MatrixRow];

export const ROW_OF_INTENT: Record<Intent, MatrixRow> = {
  [Intent.Start]: MatrixRow.StartContinue,
  [Intent.Continue]: MatrixRow.StartContinue,
  [Intent.Pause]: MatrixRow.Pause,
  [Intent.Repeat]: MatrixRow.Repeat,
  [Intent.Retake]: MatrixRow.Retake,
  [Intent.Next]: MatrixRow.Navigation,
  [Intent.Previous]: MatrixRow.Navigation,
  [Intent.Navigate]: MatrixRow.Navigation,
  [Intent.Speed]: MatrixRow.Utility,
  [Intent.ChunkSize]: MatrixRow.Utility,
  [Intent.Help]: MatrixRow.Utility,
};

const { Accept: Y, Ignore: N, TouchOnly: T, IsolatedVoice: Y_ } = Permission;
const C = MatrixColumn;

/** Exactly the §B6 table. */
export const MATRIX: Record<MatrixRow, Record<MatrixColumn, Permission>> = {
  [MatrixRow.StartContinue]: { [C.Ready]: Y, [C.SpeakingSpeaker]: N, [C.SpeakingHeadset]: N, [C.Settle]: N, [C.Waiting]: N, [C.CreatorSpeaking]: N, [C.Evaluating]: N, [C.Review]: Y, [C.Paused]: Y },
  [MatrixRow.Pause]: { [C.Ready]: Y, [C.SpeakingSpeaker]: T, [C.SpeakingHeadset]: Y, [C.Settle]: Y, [C.Waiting]: Y, [C.CreatorSpeaking]: Y_, [C.Evaluating]: Y, [C.Review]: Y, [C.Paused]: N },
  [MatrixRow.Repeat]: { [C.Ready]: Y, [C.SpeakingSpeaker]: T, [C.SpeakingHeadset]: Y, [C.Settle]: Y, [C.Waiting]: Y, [C.CreatorSpeaking]: N, [C.Evaluating]: N, [C.Review]: Y, [C.Paused]: Y },
  [MatrixRow.Retake]: { [C.Ready]: Y, [C.SpeakingSpeaker]: N, [C.SpeakingHeadset]: N, [C.Settle]: N, [C.Waiting]: Y, [C.CreatorSpeaking]: N, [C.Evaluating]: N, [C.Review]: Y, [C.Paused]: Y },
  [MatrixRow.Navigation]: { [C.Ready]: Y, [C.SpeakingSpeaker]: T, [C.SpeakingHeadset]: T, [C.Settle]: T, [C.Waiting]: Y, [C.CreatorSpeaking]: N, [C.Evaluating]: N, [C.Review]: Y, [C.Paused]: Y },
  [MatrixRow.Utility]: { [C.Ready]: Y, [C.SpeakingSpeaker]: T, [C.SpeakingHeadset]: Y, [C.Settle]: Y, [C.Waiting]: Y, [C.CreatorSpeaking]: N, [C.Evaluating]: Y, [C.Review]: Y, [C.Paused]: Y },
};

/** Speaker arrangements: the mic would hear the assistant, so no voice commands while it speaks (§A5). */
export const USES_SPEAKER: Record<Arrangement, boolean> = {
  [Arrangement.OneDeviceSpeaker]: true,
  [Arrangement.OneDeviceHeadset]: false,
  [Arrangement.TwoDevicesSpeaker]: true,
  [Arrangement.TwoDevicesHeadset]: false,
  [Arrangement.TeleprompterOnly]: true,
};

/** States outside the matrix (idle, preparing, recovering, error, completed) accept no commands. */
const COLUMN_OF_STATE: Partial<Record<SessionState, (arrangement: Arrangement) => MatrixColumn>> = {
  [SessionState.Ready]: () => C.Ready,
  [SessionState.AssistantSpeaking]: (arrangement) => (USES_SPEAKER[arrangement] ? C.SpeakingSpeaker : C.SpeakingHeadset),
  [SessionState.Settle]: () => C.Settle,
  [SessionState.WaitingForSpeech]: () => C.Waiting,
  [SessionState.CreatorSpeaking]: () => C.CreatorSpeaking,
  [SessionState.Evaluating]: () => C.Evaluating,
  [SessionState.ReviewOrAdvance]: () => C.Review,
  [SessionState.Paused]: () => C.Paused,
};

export function matrixColumn(state: SessionState, arrangement: Arrangement): MatrixColumn | null {
  return COLUMN_OF_STATE[state]?.(arrangement) ?? null;
}

/** §B6 ✓*: ≤ 2.5 s, exact grammar match, similarity to the remaining chunk text < 0.5. */
export const ISOLATED_UTTERANCE_MAX_MS = 2500;
export const ISOLATED_CHUNK_SIMILARITY_MAX = 0.5;

function isIsolated(gate: SpeechGate | undefined): boolean {
  return (
    gate !== undefined &&
    gate.exactGrammarMatch &&
    gate.durationMs <= ISOLATED_UTTERANCE_MAX_MS &&
    gate.chunkSimilarity < ISOLATED_CHUNK_SIMILARITY_MAX
  );
}

type Check = (command: CommandEvent, gate: SpeechGate | undefined) => boolean;

const ALLOWS: Record<Permission, Check> = {
  [Permission.Accept]: () => true,
  [Permission.Ignore]: () => false,
  [Permission.TouchOnly]: (command) => command.source !== CommandSource.Voice,
  [Permission.IsolatedVoice]: (command, gate) => command.source !== CommandSource.Voice || isIsolated(gate),
};

export function permissionFor(state: SessionState, arrangement: Arrangement, intent: Intent): Permission {
  const column = matrixColumn(state, arrangement);
  return column === null ? Permission.Ignore : MATRIX[ROW_OF_INTENT[intent]][column];
}

export function isCommandAllowed(state: SessionState, arrangement: Arrangement, command: CommandEvent, gate?: SpeechGate): boolean {
  return ALLOWS[permissionFor(state, arrangement, command.intent)](command, gate);
}
