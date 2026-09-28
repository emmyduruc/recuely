import {
  Arrangement,
  ChunkMode,
  CommandSource,
  type CommandEvent,
  Intent,
  isValueOf,
  MatchDecision,
  SessionState,
} from '@repo/contracts';
import { isCommandAllowed } from './matrix.ts';
import {
  type Effect,
  EffectType,
  EngineError,
  type EngineEvent,
  type EngineSettings,
  type EngineSnapshot,
  EventType,
  PromptKind,
  SpeedChange,
  type Step,
  TakeEnd,
  TimerKind,
  type Token,
} from './types.ts';

// The session engine (SPEC.md §B6): a pure reducer, `step(snapshot, event, now) → { snapshot, effects }`.
// No timers, audio, DOM or network here: those are effects the runner performs (Task 13), and their results
// come back as events carrying the token they were issued with.
//
// Flow decision (user, SPEC.md v0.13.0): a *running* session passes straight through `ready`. After NEXT or a
// confident auto-advance the next chunk is read at once, and CONTINUE after a pause re-reads the current chunk.
// `ready` is where a session rests: before the first START, after a speech error, or after navigating while
// stopped.

export const TAP_COALESCE_MS = 300;

export const DEFAULT_SETTINGS: EngineSettings = {
  arrangement: Arrangement.OneDeviceSpeaker,
  autoAdvance: true,
  captureVideo: true,
  settleMs: 600,
  silenceMs: 1200,
  noSpeechMs: 8000,
  evalTimeoutMs: 5000,
  rate: 1,
};

const RATE_MIN = 0.5;
const RATE_MAX = 2;
const RATE_STEP = 0.1;

/** States that are reading, listening or deciding: navigation keeps them reading. */
const RUNNING = new Set<SessionState>([
  SessionState.AssistantSpeaking,
  SessionState.Settle,
  SessionState.WaitingForSpeech,
  SessionState.CreatorSpeaking,
  SessionState.Evaluating,
  SessionState.ReviewOrAdvance,
]);
/** "Any active" in §B6: running plus `ready`. */
const ACTIVE = new Set<SessionState>([SessionState.Ready, ...RUNNING]);

export function createSnapshot(chunkIds: readonly string[], settings: Partial<EngineSettings> = {}): EngineSnapshot {
  return {
    state: SessionState.Idle,
    chunkIds,
    chunkIndex: 0,
    seq: 0,
    nextToken: 1,
    timer: null,
    speech: null,
    capture: null,
    take: null,
    evaluation: null,
    lastTake: null,
    prompt: null,
    error: null,
    lastTap: null,
    settings: { ...DEFAULT_SETTINGS, ...settings },
  };
}

// ── Draft: an in-progress step ─────────────────────────────────────────────────────────────────────────

interface Draft {
  snap: EngineSnapshot;
  effects: Effect[];
}

function draft(snapshot: EngineSnapshot): Draft {
  return { snap: snapshot, effects: [] };
}

function set(d: Draft, patch: Partial<EngineSnapshot>): void {
  d.snap = { ...d.snap, ...patch };
}

function emit(d: Draft, effect: Effect): void {
  d.effects.push(effect);
}

function newToken(d: Draft): Token {
  const token = d.snap.nextToken;
  set(d, { nextToken: token + 1 });
  return token;
}

function currentChunkId(snapshot: EngineSnapshot): string {
  return snapshot.chunkIds[snapshot.chunkIndex] ?? '';
}

function isLastChunk(snapshot: EngineSnapshot): boolean {
  return snapshot.chunkIndex >= snapshot.chunkIds.length - 1;
}

/**
 * Leaving a state cancels everything it started (invariant 1). A take being recorded is stopped *and
 * persisted* as interrupted (invariant 2); a take awaiting evaluation is committed without a decision.
 */
function cleanup(d: Draft): void {
  const { speech, timer, take, capture, evaluation } = d.snap;
  if (speech !== null) {
    emit(d, { type: EffectType.CancelSpeech, token: speech.token });
  }
  if (timer !== null) {
    emit(d, { type: EffectType.CancelTimer, token: timer.token });
  }
  if (take !== null) {
    emit(d, { type: EffectType.StopTake, token: take.token, end: TakeEnd.Interrupted });
  }
  if (capture !== null) {
    emit(d, { type: EffectType.DisarmCapture, token: capture.token });
  }
  if (evaluation !== null) {
    emit(d, { type: EffectType.CancelEvaluation, token: evaluation.token });
    emit(d, { type: EffectType.CommitTake, takeToken: evaluation.takeToken, chunkId: evaluation.chunkId, decision: null });
  }
  set(d, { speech: null, timer: null, take: null, capture: null, evaluation: null, prompt: null, error: null });
}

function moveTo(d: Draft, index: number): void {
  if (index !== d.snap.chunkIndex) {
    set(d, { chunkIndex: index, lastTake: null });
  }
}

function startTimer(d: Draft, kind: TimerKind, ms: number): void {
  const token = newToken(d);
  set(d, { timer: { token, kind } });
  emit(d, { type: EffectType.StartTimer, token, kind, ms });
}

function cancelTimer(d: Draft): void {
  const { timer } = d.snap;
  if (timer !== null) {
    emit(d, { type: EffectType.CancelTimer, token: timer.token });
    set(d, { timer: null });
  }
}

function speak(d: Draft, index: number): void {
  moveTo(d, index);
  const token = newToken(d);
  const chunkId = currentChunkId(d.snap);
  set(d, { state: SessionState.AssistantSpeaking, speech: { token, chunkId } });
  emit(d, { type: EffectType.Speak, token, chunkId, rate: d.snap.settings.rate });
}

function settle(d: Draft): void {
  set(d, { state: SessionState.Settle });
  startTimer(d, TimerKind.Settle, d.snap.settings.settleMs);
}

function review(d: Draft, prompt: PromptKind): void {
  set(d, { state: SessionState.ReviewOrAdvance, prompt });
  emit(d, { type: EffectType.Prompt, prompt });
}

/** Next chunk, read at once; past the last chunk the session is completed. */
function advance(d: Draft): void {
  if (isLastChunk(d.snap)) {
    set(d, { state: SessionState.Completed });
    return;
  }
  speak(d, d.snap.chunkIndex + 1);
}

/** Where navigation lands: paused stays paused, a running session keeps reading, a resting one stays ready. */
function land(d: Draft, from: SessionState, index: number): void {
  if (from === SessionState.Paused) {
    moveTo(d, index);
    set(d, { state: SessionState.Paused });
  } else if (RUNNING.has(from)) {
    speak(d, index);
  } else {
    moveTo(d, index);
    set(d, { state: SessionState.Ready });
  }
}

// ── Commands ─────────────────────────────────────────────────────────────────────────────────────────────

type IntentHandler = (d: Draft, command: CommandEvent, from: SessionState) => boolean;

const SPEED: Record<SpeedChange, (rate: number) => number> = {
  [SpeedChange.Slower]: (rate) => Math.max(RATE_MIN, Math.round((rate - RATE_STEP) * 10) / 10),
  [SpeedChange.Faster]: (rate) => Math.min(RATE_MAX, Math.round((rate + RATE_STEP) * 10) / 10),
  [SpeedChange.Normal]: () => 1,
};

const START_OR_CONTINUE: Partial<Record<SessionState, (d: Draft) => void>> = {
  [SessionState.Ready]: (d) => {
    speak(d, d.snap.chunkIndex);
  },
  [SessionState.Paused]: (d) => {
    speak(d, d.snap.chunkIndex);
  },
  [SessionState.ReviewOrAdvance]: (d) => {
    cleanup(d);
    advance(d);
  },
};

function navigate(d: Draft, from: SessionState, index: number): boolean {
  cleanup(d);
  land(d, from, index);
  return true;
}

/** Each handler returns false for a no-op (e.g. PREVIOUS on the first chunk), which is ignored. */
const INTENT: Record<Intent, IntentHandler> = {
  [Intent.Start]: (d, _command, from) => {
    const handler = START_OR_CONTINUE[from];
    handler?.(d);
    return handler !== undefined;
  },
  [Intent.Continue]: (d, command, from) => INTENT[Intent.Start](d, command, from),
  [Intent.Pause]: (d) => {
    cleanup(d);
    set(d, { state: SessionState.Paused });
    return true;
  },
  [Intent.Repeat]: (d) => {
    cleanup(d);
    speak(d, d.snap.chunkIndex);
    return true;
  },
  [Intent.Retake]: (d) => {
    cleanup(d);
    const { lastTake } = d.snap;
    if (lastTake !== null && lastTake.chunkId === currentChunkId(d.snap)) {
      emit(d, { type: EffectType.MarkAlternative, takeToken: lastTake.token });
    }
    settle(d);
    return true;
  },
  [Intent.Next]: (d, _command, from) => {
    if (isLastChunk(d.snap)) {
      cleanup(d);
      set(d, { state: SessionState.Completed });
      return true;
    }
    return navigate(d, from, d.snap.chunkIndex + 1);
  },
  [Intent.Previous]: (d, _command, from) => d.snap.chunkIndex > 0 && navigate(d, from, d.snap.chunkIndex - 1),
  [Intent.Navigate]: (d, command, from) => {
    const index = d.snap.chunkIds.indexOf(command.args?.chunkId ?? '');
    return index >= 0 && navigate(d, from, index);
  },
  [Intent.Speed]: (d, command) => {
    const change = command.args?.speed;
    if (!isValueOf(SpeedChange, change)) {
      return false;
    }
    const rate = SPEED[change](d.snap.settings.rate);
    set(d, { settings: { ...d.snap.settings, rate } });
    emit(d, { type: EffectType.ApplySpeed, rate });
    return true;
  },
  [Intent.ChunkSize]: (d, command) => {
    const mode = command.args?.mode;
    if (!isValueOf(ChunkMode, mode)) {
      return false;
    }
    emit(d, { type: EffectType.RequestRechunk, fromChunkId: currentChunkId(d.snap), mode });
    return true;
  },
  [Intent.Help]: (d) => {
    emit(d, { type: EffectType.ShowHelp });
    return true;
  },
};

function handleCommand(s: EngineSnapshot, event: Extract<EngineEvent, { type: typeof EventType.Command }>, now: number): Draft | null {
  const { command, speechGate } = event;
  if (!isCommandAllowed(s.state, s.settings.arrangement, command, speechGate)) {
    return null;
  }
  const isTap = command.source !== CommandSource.Voice;
  const sinceTap = s.lastTap === null ? Number.POSITIVE_INFINITY : now - s.lastTap.at;
  if (isTap && s.lastTap?.intent === command.intent && sinceTap >= 0 && sinceTap < TAP_COALESCE_MS) {
    return null;
  }
  const d = draft(s);
  if (!INTENT[command.intent](d, command, s.state)) {
    return null;
  }
  if (isTap) {
    set(d, { lastTap: { intent: command.intent, at: now } });
  }
  return d;
}

// ── Timers ───────────────────────────────────────────────────────────────────────────────────────────────

const TIMER: Record<TimerKind, { state: SessionState; fire: (d: Draft) => void }> = {
  [TimerKind.Settle]: {
    state: SessionState.Settle,
    fire: (d) => {
      const token = newToken(d);
      set(d, { state: SessionState.WaitingForSpeech, capture: { token } });
      emit(d, { type: EffectType.ArmCapture, token, chunkId: currentChunkId(d.snap) });
      startTimer(d, TimerKind.NoSpeech, d.snap.settings.noSpeechMs);
    },
  },
  [TimerKind.NoSpeech]: {
    state: SessionState.WaitingForSpeech,
    fire: (d) => {
      disarm(d);
      review(d, PromptKind.NoSpeech);
    },
  },
  [TimerKind.Silence]: {
    state: SessionState.CreatorSpeaking,
    fire: (d) => {
      const { take } = d.snap;
      if (take !== null) {
        emit(d, { type: EffectType.StopTake, token: take.token, end: TakeEnd.Complete });
        set(d, { take: null, lastTake: { token: take.token, chunkId: take.chunkId } });
      }
      disarm(d);
      const token = newToken(d);
      const chunkId = currentChunkId(d.snap);
      const takeToken = take?.token ?? 0;
      set(d, { state: SessionState.Evaluating, evaluation: { token, chunkId, takeToken } });
      emit(d, { type: EffectType.Evaluate, token, chunkId, takeToken });
      startTimer(d, TimerKind.EvalTimeout, d.snap.settings.evalTimeoutMs);
    },
  },
  [TimerKind.EvalTimeout]: {
    state: SessionState.Evaluating,
    fire: (d) => {
      const { evaluation } = d.snap;
      if (evaluation !== null) {
        emit(d, { type: EffectType.CancelEvaluation, token: evaluation.token });
        emit(d, { type: EffectType.CommitTake, takeToken: evaluation.takeToken, chunkId: evaluation.chunkId, decision: null });
      }
      set(d, { evaluation: null });
      review(d, PromptKind.EvalUnavailable);
    },
  },
};

function disarm(d: Draft): void {
  const { capture } = d.snap;
  if (capture !== null) {
    emit(d, { type: EffectType.DisarmCapture, token: capture.token });
    set(d, { capture: null });
  }
}

// ── Events ───────────────────────────────────────────────────────────────────────────────────────────────

type Handler<K extends EventType> = (s: EngineSnapshot, event: Extract<EngineEvent, { type: K }>, now: number) => Draft | null;

function when(condition: boolean, s: EngineSnapshot, build: (d: Draft) => void): Draft | null {
  if (!condition) {
    return null;
  }
  const d = draft(s);
  build(d);
  return d;
}

function toRecovering(s: EngineSnapshot): Draft | null {
  return when(ACTIVE.has(s.state) || s.state === SessionState.Paused, s, (d) => {
    cleanup(d);
    emit(d, { type: EffectType.StopAllTracks });
    set(d, { state: SessionState.Recovering });
  });
}

const HANDLERS: { [K in EventType]: Handler<K> } = {
  [EventType.Prepare]: (s) =>
    when(s.state === SessionState.Idle || s.state === SessionState.Error, s, (d) => {
      set(d, { state: SessionState.Preparing, error: null });
      emit(d, { type: EffectType.ProbeCapabilities });
    }),
  [EventType.CapsReady]: (s, event) =>
    when(s.state === SessionState.Preparing, s, (d) => {
      if (event.minCapsMet) {
        set(d, { state: SessionState.Ready });
      } else {
        set(d, { state: SessionState.Error, error: EngineError.CapabilitiesMissing });
        emit(d, { type: EffectType.ShowError, error: EngineError.CapabilitiesMissing });
      }
    }),
  [EventType.CapsFailed]: (s) =>
    when(s.state === SessionState.Preparing, s, (d) => {
      set(d, { state: SessionState.Error, error: EngineError.CapabilitiesMissing });
      emit(d, { type: EffectType.ShowError, error: EngineError.CapabilitiesMissing });
    }),
  [EventType.Command]: handleCommand,
  [EventType.Finish]: (s) =>
    when(s.state === SessionState.Ready || s.state === SessionState.Paused || s.state === SessionState.ReviewOrAdvance, s, (d) => {
      cleanup(d);
      set(d, { state: SessionState.Completed });
    }),
  [EventType.TtsEnded]: (s, event) =>
    when(s.state === SessionState.AssistantSpeaking && s.speech?.token === event.token, s, (d) => {
      set(d, { speech: null });
      settle(d);
    }),
  [EventType.TtsFailed]: (s, event) =>
    when(s.state === SessionState.AssistantSpeaking && s.speech?.token === event.token, s, (d) => {
      set(d, { speech: null, state: SessionState.Ready, error: EngineError.TtsFailed });
      emit(d, { type: EffectType.ShowError, error: EngineError.TtsFailed });
    }),
  [EventType.Timer]: (s, event) => {
    const timer = s.timer;
    if (timer === null || timer.token !== event.token || TIMER[timer.kind].state !== s.state) {
      return null;
    }
    const d = draft(s);
    set(d, { timer: null });
    TIMER[timer.kind].fire(d);
    return d;
  },
  [EventType.VadStart]: (s, event) => {
    if (s.capture?.token !== event.token) {
      return null;
    }
    if (s.state === SessionState.WaitingForSpeech) {
      const d = draft(s);
      cancelTimer(d);
      const token = newToken(d);
      const chunkId = currentChunkId(s);
      set(d, { state: SessionState.CreatorSpeaking, take: { token, chunkId } });
      emit(d, { type: EffectType.StartTake, token, chunkId, video: s.settings.captureVideo });
      return d;
    }
    // Speech resumed before the silence timer fired: keep recording, cancel the timer (E3).
    return when(s.state === SessionState.CreatorSpeaking && s.timer !== null, s, cancelTimer);
  },
  [EventType.VadEnd]: (s, event) =>
    when(s.state === SessionState.CreatorSpeaking && s.capture?.token === event.token && s.timer === null, s, (d) => {
      startTimer(d, TimerKind.Silence, s.settings.silenceMs);
    }),
  [EventType.EvalResult]: (s, event) => {
    const evaluation = s.evaluation;
    const current = s.state === SessionState.Evaluating && evaluation !== null && evaluation.token === event.token;
    return when(current && evaluation.chunkId === event.chunkId, s, (d) => {
      cancelTimer(d);
      emit(d, { type: EffectType.CommitTake, takeToken: evaluation?.takeToken ?? 0, chunkId: event.chunkId, decision: event.decision });
      set(d, { evaluation: null });
      if (s.settings.autoAdvance && event.decision === MatchDecision.Advance) {
        advance(d);
      } else {
        review(d, PromptKind.Decision);
      }
    });
  },
  [EventType.EvalFailed]: (s, event) => {
    const evaluation = s.evaluation;
    return when(s.state === SessionState.Evaluating && evaluation?.token === event.token, s, (d) => {
      cancelTimer(d);
      emit(d, { type: EffectType.CommitTake, takeToken: evaluation?.takeToken ?? 0, chunkId: evaluation?.chunkId ?? '', decision: null });
      set(d, { evaluation: null });
      review(d, PromptKind.EvalUnavailable);
    });
  },
  [EventType.VisibilityHidden]: (s) =>
    when(ACTIVE.has(s.state), s, (d) => {
      cleanup(d);
      set(d, { state: SessionState.Paused });
    }),
  [EventType.DeviceLost]: toRecovering,
  [EventType.PermissionRevoked]: toRecovering,
  [EventType.DeviceRestored]: (s) =>
    when(s.state === SessionState.Recovering, s, (d) => {
      set(d, { state: SessionState.Paused });
    }),
  [EventType.PlanChanged]: (s, event) => {
    const index = event.chunkIds.indexOf(event.currentChunkId);
    return when(index >= 0 && s.state !== SessionState.Completed, s, (d) => {
      const changed = event.currentChunkId !== currentChunkId(s);
      set(d, { chunkIds: event.chunkIds, chunkIndex: index, ...(changed ? { lastTake: null } : {}) });
    });
  },
};

type AnyHandler = (s: EngineSnapshot, event: EngineEvent, now: number) => Draft | null;

function dispatch(s: EngineSnapshot, event: EngineEvent, now: number): Draft | null {
  // HANDLERS is keyed by event type, so HANDLERS[event.type] always receives its own event shape; TypeScript
  // can't correlate the union with the mapped type, hence the one cast.
  const handler = HANDLERS[event.type] as AnyHandler;
  return handler(s, event, now);
}

/**
 * One engine step. Ignored events return the same snapshot object and no effects. Accepted events bump `seq`
 * and add a `persist` effect whenever state, chunk or settings changed (the runner autosaves, Task 4).
 */
export function step(snapshot: EngineSnapshot, event: EngineEvent, now: number): Step {
  const d = dispatch(snapshot, event, now);
  if (d === null) {
    return { snapshot, effects: [] };
  }
  const next = { ...d.snap, seq: snapshot.seq + 1 };
  const changed =
    next.state !== snapshot.state || next.chunkIndex !== snapshot.chunkIndex || next.settings !== snapshot.settings || next.chunkIds !== snapshot.chunkIds;
  return { snapshot: next, effects: changed ? [...d.effects, { type: EffectType.Persist }] : d.effects };
}
