import type { Arrangement, ChunkMode, CommandEvent, MatchDecision, SessionState, SpeechGate } from '@repo/contracts';

export type { SpeechGate } from '@repo/contracts';

// Session engine types (SPEC.md §B6). The engine is a pure reducer:
//   (snapshot, event, now) → { snapshot, effects[] }
// Every async operation (speech, timer, capture, take, evaluation) gets a token; a result is accepted only while
// its token is still the current one, so late results can't touch a newer chunk (stale guard, E10).

export type Token = number;

export const TimerKind = {
  Settle: 'settle',
  NoSpeech: 'no_speech',
  Silence: 'silence',
  EvalTimeout: 'eval_timeout',
} as const;
export type TimerKind = (typeof TimerKind)[keyof typeof TimerKind];

export const PromptKind = {
  /** "Next · Repeat · Retake" after an uncertain match (or manual mode). */
  Decision: 'decision',
  NoSpeech: 'no_speech',
  EvalUnavailable: 'eval_unavailable',
} as const;
export type PromptKind = (typeof PromptKind)[keyof typeof PromptKind];

export const EngineError = {
  TtsFailed: 'tts_failed',
  CapabilitiesMissing: 'capabilities_missing',
} as const;
export type EngineError = (typeof EngineError)[keyof typeof EngineError];

export const TakeEnd = {
  Complete: 'complete',
  Interrupted: 'interrupted',
} as const;
export type TakeEnd = (typeof TakeEnd)[keyof typeof TakeEnd];

export const SpeedChange = {
  Slower: 'slower',
  Faster: 'faster',
  Normal: 'normal',
} as const;
export type SpeedChange = (typeof SpeedChange)[keyof typeof SpeedChange];

export interface EngineSettings {
  arrangement: Arrangement;
  /** Auto mode advances on a confident match; manual mode always asks. */
  autoAdvance: boolean;
  /** False in practice mode (audio only). */
  captureVideo: boolean;
  settleMs: number;
  silenceMs: number;
  noSpeechMs: number;
  evalTimeoutMs: number;
  rate: number;
}

export interface EngineSnapshot {
  state: SessionState;
  chunkIds: readonly string[];
  chunkIndex: number;
  /** Strictly increasing with every accepted change (autosave ordering, invariant 5). */
  seq: number;
  nextToken: Token;
  timer: { token: Token; kind: TimerKind } | null;
  speech: { token: Token; chunkId: string } | null;
  capture: { token: Token } | null;
  take: { token: Token; chunkId: string } | null;
  evaluation: { token: Token; chunkId: string; takeToken: Token } | null;
  /** The last completed take of the current chunk (a retake marks it as an alternative). */
  lastTake: { token: Token; chunkId: string } | null;
  prompt: PromptKind | null;
  error: EngineError | null;
  lastTap: { intent: CommandEvent['intent']; at: number } | null;
  settings: EngineSettings;
}

export const EventType = {
  Prepare: 'PREPARE',
  CapsReady: 'CAPS_READY',
  CapsFailed: 'CAPS_FAILED',
  Command: 'COMMAND',
  Finish: 'FINISH',
  TtsEnded: 'TTS_ENDED',
  TtsFailed: 'TTS_FAILED',
  Timer: 'TIMER',
  VadStart: 'VAD_START',
  VadEnd: 'VAD_END',
  EvalResult: 'EVAL_RESULT',
  EvalFailed: 'EVAL_FAILED',
  VisibilityHidden: 'VISIBILITY_HIDDEN',
  DeviceLost: 'DEVICE_LOST',
  PermissionRevoked: 'PERMISSION_REVOKED',
  DeviceRestored: 'DEVICE_RESTORED',
  PlanChanged: 'PLAN_CHANGED',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export type EngineEvent =
  | { type: typeof EventType.Prepare }
  | { type: typeof EventType.CapsReady; minCapsMet: boolean }
  | { type: typeof EventType.CapsFailed }
  | { type: typeof EventType.Command; command: CommandEvent; speechGate?: SpeechGate }
  | { type: typeof EventType.Finish }
  | { type: typeof EventType.TtsEnded; token: Token }
  | { type: typeof EventType.TtsFailed; token: Token }
  | { type: typeof EventType.Timer; token: Token }
  | { type: typeof EventType.VadStart; token: Token }
  | { type: typeof EventType.VadEnd; token: Token }
  | { type: typeof EventType.EvalResult; token: Token; chunkId: string; decision: MatchDecision }
  | { type: typeof EventType.EvalFailed; token: Token }
  | { type: typeof EventType.VisibilityHidden }
  | { type: typeof EventType.DeviceLost }
  | { type: typeof EventType.PermissionRevoked }
  | { type: typeof EventType.DeviceRestored }
  | { type: typeof EventType.PlanChanged; chunkIds: readonly string[]; currentChunkId: string };

export const EffectType = {
  ProbeCapabilities: 'probe_capabilities',
  Speak: 'speak',
  CancelSpeech: 'cancel_speech',
  StartTimer: 'start_timer',
  CancelTimer: 'cancel_timer',
  ArmCapture: 'arm_capture',
  DisarmCapture: 'disarm_capture',
  StartTake: 'start_take',
  /** The runner always persists the take (invariant 2), complete or interrupted. */
  StopTake: 'stop_take',
  Evaluate: 'evaluate',
  CancelEvaluation: 'cancel_evaluation',
  CommitTake: 'commit_take',
  MarkAlternative: 'mark_alternative',
  Prompt: 'prompt',
  ShowError: 'show_error',
  ApplySpeed: 'apply_speed',
  RequestRechunk: 'request_rechunk',
  ShowHelp: 'show_help',
  StopAllTracks: 'stop_all_tracks',
  Persist: 'persist',
} as const;
export type EffectType = (typeof EffectType)[keyof typeof EffectType];

export type Effect =
  | { type: typeof EffectType.ProbeCapabilities }
  | { type: typeof EffectType.Speak; token: Token; chunkId: string; rate: number }
  | { type: typeof EffectType.CancelSpeech; token: Token }
  | { type: typeof EffectType.StartTimer; token: Token; kind: TimerKind; ms: number }
  | { type: typeof EffectType.CancelTimer; token: Token }
  | { type: typeof EffectType.ArmCapture; token: Token; chunkId: string }
  | { type: typeof EffectType.DisarmCapture; token: Token }
  | { type: typeof EffectType.StartTake; token: Token; chunkId: string; video: boolean }
  | { type: typeof EffectType.StopTake; token: Token; end: TakeEnd }
  | { type: typeof EffectType.Evaluate; token: Token; chunkId: string; takeToken: Token }
  | { type: typeof EffectType.CancelEvaluation; token: Token }
  | { type: typeof EffectType.CommitTake; takeToken: Token; chunkId: string; decision: MatchDecision | null }
  | { type: typeof EffectType.MarkAlternative; takeToken: Token }
  | { type: typeof EffectType.Prompt; prompt: PromptKind }
  | { type: typeof EffectType.ShowError; error: EngineError }
  | { type: typeof EffectType.ApplySpeed; rate: number }
  | { type: typeof EffectType.RequestRechunk; fromChunkId: string; mode: ChunkMode }
  | { type: typeof EffectType.ShowHelp }
  | { type: typeof EffectType.StopAllTracks }
  | { type: typeof EffectType.Persist };

export interface Step {
  snapshot: EngineSnapshot;
  effects: Effect[];
}
