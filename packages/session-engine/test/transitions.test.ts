import { Arrangement, CommandSource, Intent, MatchDecision, SessionState } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import {
  createSnapshot,
  EffectType,
  EngineError,
  type EngineEvent,
  type EngineSnapshot,
  EventType,
  PromptKind,
  step,
  TakeEnd,
  TimerKind,
} from '../src/index.ts';
import { cmd, driveTo, types } from './helpers.ts';

// One test (or more) per row of the SPEC.md §B6 transition table. Names cite the row: B6-R01 … B6-R21.

function pending(s: EngineSnapshot, key: 'speech' | 'timer' | 'capture' | 'take' | 'evaluation'): number {
  const value = s[key];
  if (value === null) {
    throw new Error(`no pending ${key}`);
  }
  return value.token;
}

const ACTIVE_STATES = [
  SessionState.Ready,
  SessionState.AssistantSpeaking,
  SessionState.Settle,
  SessionState.WaitingForSpeech,
  SessionState.CreatorSpeaking,
  SessionState.Evaluating,
  SessionState.ReviewOrAdvance,
];

describe('§B6 transitions', () => {
  it('B6-R01: idle PREPARE → preparing, probing capabilities', () => {
    const next = step(createSnapshot(['c1']), { type: EventType.Prepare }, 0);
    expect(next.snapshot.state).toBe(SessionState.Preparing);
    expect(types(next.effects)).toEqual([EffectType.ProbeCapabilities, EffectType.Persist]);
  });

  it('B6-R02: preparing CAPS_READY with minimum capabilities → ready (persisted)', () => {
    const next = step(driveTo(SessionState.Preparing), { type: EventType.CapsReady, minCapsMet: true }, 0);
    expect(next.snapshot.state).toBe(SessionState.Ready);
    expect(types(next.effects)).toEqual([EffectType.Persist]);
  });

  it('B6-R03: preparing CAPS_READY without minimum capabilities, or CAPS_FAILED → error', () => {
    for (const event of [{ type: EventType.CapsReady, minCapsMet: false }, { type: EventType.CapsFailed }] as EngineEvent[]) {
      const next = step(driveTo(SessionState.Preparing), event, 0);
      expect(next.snapshot).toMatchObject({ state: SessionState.Error, error: EngineError.CapabilitiesMissing });
      expect(next.effects).toContainEqual({ type: EffectType.ShowError, error: EngineError.CapabilitiesMissing });
    }
    expect(step(driveTo(SessionState.Error), { type: EventType.Prepare }, 0).snapshot.state).toBe(SessionState.Preparing);
  });

  it('B6-R04: ready START or CONTINUE → assistant_speaking, speaking the current chunk', () => {
    for (const intent of [Intent.Start, Intent.Continue]) {
      const ready = driveTo(SessionState.Ready);
      const next = step(ready, cmd(intent), 0);
      expect(next.snapshot.state).toBe(SessionState.AssistantSpeaking);
      expect(next.effects[0]).toMatchObject({ type: EffectType.Speak, chunkId: 'c2', rate: 1 });
    }
  });

  it('B6-R05: assistant_speaking TTS_ENDED (token match) → settle with the settle timer; a stale token is ignored', () => {
    const speaking = driveTo(SessionState.AssistantSpeaking, { settleMs: 750 });
    const stale = step(speaking, { type: EventType.TtsEnded, token: pending(speaking, 'speech') - 1 }, 0);
    expect(stale).toEqual({ snapshot: speaking, effects: [] });
    const next = step(speaking, { type: EventType.TtsEnded, token: pending(speaking, 'speech') }, 0);
    expect(next.snapshot.state).toBe(SessionState.Settle);
    expect(next.effects[0]).toMatchObject({ type: EffectType.StartTimer, kind: TimerKind.Settle, ms: 750 });
  });

  it('B6-R06: assistant_speaking TTS_FAILED → ready, showing the text and an error', () => {
    const speaking = driveTo(SessionState.AssistantSpeaking);
    const next = step(speaking, { type: EventType.TtsFailed, token: pending(speaking, 'speech') }, 0);
    expect(next.snapshot).toMatchObject({ state: SessionState.Ready, error: EngineError.TtsFailed, speech: null });
    expect(next.effects).toContainEqual({ type: EffectType.ShowError, error: EngineError.TtsFailed });
  });

  it('B6-R07: settle TIMER → waiting_for_speech, arming capture and the no-speech timer', () => {
    const settling = driveTo(SessionState.Settle, { noSpeechMs: 8000 });
    const next = step(settling, { type: EventType.Timer, token: pending(settling, 'timer') }, 0);
    expect(next.snapshot.state).toBe(SessionState.WaitingForSpeech);
    expect(types(next.effects)).toEqual([EffectType.ArmCapture, EffectType.StartTimer, EffectType.Persist]);
    expect(next.effects[1]).toMatchObject({ kind: TimerKind.NoSpeech, ms: 8000 });
  });

  it('B6-R08: waiting_for_speech VAD_START → creator_speaking, starting the take', () => {
    const waiting = driveTo(SessionState.WaitingForSpeech, { captureVideo: false });
    const next = step(waiting, { type: EventType.VadStart, token: pending(waiting, 'capture') }, 0);
    expect(next.snapshot.state).toBe(SessionState.CreatorSpeaking);
    expect(types(next.effects)).toEqual([EffectType.CancelTimer, EffectType.StartTake, EffectType.Persist]);
    expect(next.effects[1]).toMatchObject({ chunkId: 'c2', video: false });
  });

  it('B6-R09: waiting_for_speech TIMER(noSpeech) → review_or_advance with a no-speech prompt', () => {
    const waiting = driveTo(SessionState.WaitingForSpeech);
    const next = step(waiting, { type: EventType.Timer, token: pending(waiting, 'timer') }, 0);
    expect(next.snapshot).toMatchObject({ state: SessionState.ReviewOrAdvance, prompt: PromptKind.NoSpeech, capture: null });
    expect(types(next.effects)).toEqual([EffectType.DisarmCapture, EffectType.Prompt, EffectType.Persist]);
  });

  it('B6-R10: creator_speaking VAD_END starts the silence timer; VAD_START cancels it (state unchanged)', () => {
    const speaking = driveTo(SessionState.CreatorSpeaking, { silenceMs: 1200 });
    const capture = pending(speaking, 'capture');
    const quiet = step(speaking, { type: EventType.VadEnd, token: capture }, 0);
    expect(quiet.snapshot.state).toBe(SessionState.CreatorSpeaking);
    expect(quiet.effects).toEqual([{ type: EffectType.StartTimer, token: pending(quiet.snapshot, 'timer'), kind: TimerKind.Silence, ms: 1200 }]);
    const resumed = step(quiet.snapshot, { type: EventType.VadStart, token: capture }, 0);
    expect(resumed.snapshot.state).toBe(SessionState.CreatorSpeaking);
    expect(resumed.snapshot.timer).toBeNull();
    expect(types(resumed.effects)).toEqual([EffectType.CancelTimer]);
  });

  it('B6-R11: creator_speaking TIMER(silence) → evaluating: stop (and persist) the take, evaluate, start the timeout', () => {
    const speaking = driveTo(SessionState.CreatorSpeaking);
    const take = pending(speaking, 'take');
    const quiet = step(speaking, { type: EventType.VadEnd, token: pending(speaking, 'capture') }, 0).snapshot;
    const next = step(quiet, { type: EventType.Timer, token: pending(quiet, 'timer') }, 0);
    expect(next.snapshot.state).toBe(SessionState.Evaluating);
    expect(next.effects[0]).toEqual({ type: EffectType.StopTake, token: take, end: TakeEnd.Complete });
    expect(types(next.effects)).toEqual([EffectType.StopTake, EffectType.DisarmCapture, EffectType.Evaluate, EffectType.StartTimer, EffectType.Persist]);
    expect(next.snapshot.lastTake).toEqual({ token: take, chunkId: 'c2' });
  });

  it('B6-R12: evaluating EVAL_RESULT (token match ∧ auto ∧ confident) → next chunk is read at once; the take is committed', () => {
    const evaluating = driveTo(SessionState.Evaluating, { autoAdvance: true }, 0);
    const event: EngineEvent = { type: EventType.EvalResult, token: pending(evaluating, 'evaluation'), chunkId: 'c1', decision: MatchDecision.Advance };
    const next = step(evaluating, event, 0);
    expect(next.snapshot).toMatchObject({ state: SessionState.AssistantSpeaking, chunkIndex: 1 });
    expect(next.effects).toContainEqual(expect.objectContaining({ type: EffectType.CommitTake, decision: MatchDecision.Advance }));
    expect(next.effects).toContainEqual(expect.objectContaining({ type: EffectType.Speak, chunkId: 'c2' }));
    expect(types(next.effects).at(-1)).toBe(EffectType.Persist);
    // A result for another chunk (even with the right token) is ignored.
    expect(step(evaluating, { ...event, chunkId: 'c2' }, 0).snapshot).toBe(evaluating);
  });

  it('B6-R13: evaluating EVAL_RESULT not (auto ∧ confident) → review_or_advance with the decision prompt', () => {
    const cases = [
      { autoAdvance: false, decision: MatchDecision.Advance },
      { autoAdvance: true, decision: MatchDecision.Ask },
    ];
    for (const { autoAdvance, decision } of cases) {
      const evaluating = driveTo(SessionState.Evaluating, { autoAdvance });
      const next = step(evaluating, { type: EventType.EvalResult, token: pending(evaluating, 'evaluation'), chunkId: 'c2', decision }, 0);
      expect(next.snapshot).toMatchObject({ state: SessionState.ReviewOrAdvance, prompt: PromptKind.Decision, chunkIndex: 1 });
      expect(next.effects).toContainEqual(expect.objectContaining({ type: EffectType.CommitTake, decision }));
    }
  });

  it('B6-R14: evaluating EVAL_FAILED or the evaluation TIMEOUT → review_or_advance, eval unavailable, take committed', () => {
    const evaluating = driveTo(SessionState.Evaluating);
    const failed = step(evaluating, { type: EventType.EvalFailed, token: pending(evaluating, 'evaluation') }, 0);
    const timedOut = step(evaluating, { type: EventType.Timer, token: pending(evaluating, 'timer') }, 0);
    for (const next of [failed, timedOut]) {
      expect(next.snapshot).toMatchObject({ state: SessionState.ReviewOrAdvance, prompt: PromptKind.EvalUnavailable, evaluation: null });
      expect(next.effects).toContainEqual(expect.objectContaining({ type: EffectType.CommitTake, decision: null }));
    }
    expect(timedOut.effects).toContainEqual(expect.objectContaining({ type: EffectType.CancelEvaluation }));
  });

  it('B6-R15: review_or_advance NEXT → next chunk read, REPEAT → same chunk read, RETAKE → settle and mark the take alternative', () => {
    const review = driveTo(SessionState.ReviewOrAdvance);
    const next = step(review, cmd(Intent.Next), 0);
    expect(next.snapshot).toMatchObject({ state: SessionState.AssistantSpeaking, chunkIndex: 2 });
    const repeat = step(review, cmd(Intent.Repeat), 0);
    expect(repeat.snapshot).toMatchObject({ state: SessionState.AssistantSpeaking, chunkIndex: 1 });
    const retake = step(review, cmd(Intent.Retake), 0);
    expect(retake.snapshot.state).toBe(SessionState.Settle);
    expect(retake.effects[0]).toEqual({ type: EffectType.MarkAlternative, takeToken: review.lastTake?.token });
  });

  it('B6-R16: any active state PAUSE or VISIBILITY_HIDDEN → paused: speech cancelled, take stopped as interrupted, mic off, timers cleared', () => {
    for (const state of ACTIVE_STATES) {
      for (const event of [cmd(Intent.Pause), { type: EventType.VisibilityHidden } as EngineEvent]) {
        const before = driveTo(state);
        const next = step(before, event, 0);
        expect(next.snapshot.state, state).toBe(SessionState.Paused);
        expect(next.snapshot).toMatchObject({ speech: null, timer: null, capture: null, take: null, evaluation: null });
        if (before.take !== null) {
          expect(next.effects).toContainEqual({ type: EffectType.StopTake, token: before.take.token, end: TakeEnd.Interrupted });
        }
        if (before.speech !== null) {
          expect(next.effects).toContainEqual({ type: EffectType.CancelSpeech, token: before.speech.token });
        }
      }
    }
  });

  it('B6-R17: paused CONTINUE → the current chunk is read again (user decision: running sessions keep reading)', () => {
    const paused = driveTo(SessionState.Paused);
    const next = step(paused, cmd(Intent.Continue), 0);
    expect(next.snapshot).toMatchObject({ state: SessionState.AssistantSpeaking, chunkIndex: 1 });
    expect(next.effects[0]).toMatchObject({ type: EffectType.Speak, chunkId: 'c2' });
  });

  it('B6-R18: any active state DEVICE_LOST or PERMISSION_REVOKED → recovering: all tracks stopped, take kept as interrupted', () => {
    for (const state of [...ACTIVE_STATES, SessionState.Paused]) {
      for (const type of [EventType.DeviceLost, EventType.PermissionRevoked]) {
        const before = driveTo(state);
        const next = step(before, { type }, 0);
        expect(next.snapshot.state, state).toBe(SessionState.Recovering);
        expect(next.effects).toContainEqual({ type: EffectType.StopAllTracks });
        expect(next.snapshot.capture).toBeNull();
        if (before.take !== null) {
          expect(next.effects).toContainEqual({ type: EffectType.StopTake, token: before.take.token, end: TakeEnd.Interrupted });
        }
      }
    }
  });

  it('B6-R19: recovering DEVICE_RESTORED → paused', () => {
    expect(step(driveTo(SessionState.Recovering), { type: EventType.DeviceRestored }, 0).snapshot.state).toBe(SessionState.Paused);
  });

  it('B6-R20: ready FINISH, or NEXT at the last chunk → completed (persisted)', () => {
    const finish = step(driveTo(SessionState.Ready), { type: EventType.Finish }, 0);
    expect(finish.snapshot.state).toBe(SessionState.Completed);
    expect(types(finish.effects)).toEqual([EffectType.Persist]);
    const last = step(driveTo(SessionState.Ready, {}, 2), cmd(Intent.Next), 0);
    expect(last.snapshot.state).toBe(SessionState.Completed);
  });

  it('B6-R21: a confident auto-advance on the last chunk completes the session', () => {
    const evaluating = driveTo(SessionState.Evaluating, { autoAdvance: true }, 2);
    const next = step(evaluating, { type: EventType.EvalResult, token: pending(evaluating, 'evaluation'), chunkId: 'c3', decision: MatchDecision.Advance }, 0);
    expect(next.snapshot.state).toBe(SessionState.Completed);
  });
});

describe('engine details', () => {
  it('T5: repeated taps of one command within 300 ms are coalesced; voice is never coalesced', () => {
    const ready = driveTo(SessionState.Ready, {}, 0);
    const first = step(ready, cmd(Intent.Next), 1000).snapshot;
    expect(first.chunkIndex).toBe(1);
    expect(step(first, cmd(Intent.Next), 1200).snapshot).toBe(first);
    expect(step(first, cmd(Intent.Next), 1300).snapshot.chunkIndex).toBe(2);
    expect(step(first, cmd(Intent.Next, CommandSource.Voice), 1100).snapshot.chunkIndex).toBe(2);
  });

  it('T5: voice PAUSE during creator speech needs an isolated, exact, short utterance; touch always works', () => {
    const speaking = driveTo(SessionState.CreatorSpeaking);
    const pause = cmd(Intent.Pause, CommandSource.Voice);
    const withGate = (gate: { durationMs: number; exactGrammarMatch: boolean; chunkSimilarity: number }): EngineEvent => ({ ...pause, speechGate: gate } as EngineEvent);
    expect(step(speaking, pause, 0).snapshot).toBe(speaking);
    expect(step(speaking, withGate({ durationMs: 900, exactGrammarMatch: true, chunkSimilarity: 0.2 }), 0).snapshot.state).toBe(SessionState.Paused);
    expect(step(speaking, withGate({ durationMs: 3000, exactGrammarMatch: true, chunkSimilarity: 0.2 }), 0).snapshot).toBe(speaking);
    expect(step(speaking, withGate({ durationMs: 900, exactGrammarMatch: false, chunkSimilarity: 0.2 }), 0).snapshot).toBe(speaking);
    expect(step(speaking, withGate({ durationMs: 900, exactGrammarMatch: true, chunkSimilarity: 0.5 }), 0).snapshot).toBe(speaking);
    expect(step(speaking, cmd(Intent.Pause, CommandSource.Touch), 0).snapshot.state).toBe(SessionState.Paused);
  });

  it('T5: in A1 (speaker) assistant speech ignores voice commands but takes touch; in A2 (headset) voice works', () => {
    const a1 = driveTo(SessionState.AssistantSpeaking, { arrangement: Arrangement.OneDeviceSpeaker });
    expect(step(a1, cmd(Intent.Pause, CommandSource.Voice), 0).snapshot).toBe(a1);
    expect(step(a1, cmd(Intent.Pause, CommandSource.Touch), 0).snapshot.state).toBe(SessionState.Paused);
    const a2 = driveTo(SessionState.AssistantSpeaking, { arrangement: Arrangement.OneDeviceHeadset });
    expect(step(a2, cmd(Intent.Pause, CommandSource.Voice), 0).snapshot.state).toBe(SessionState.Paused);
  });

  it('T5: navigation while stopped stays put; while running it keeps reading; while paused it stays paused', () => {
    expect(step(driveTo(SessionState.Ready, {}, 1), cmd(Intent.Previous), 0).snapshot).toMatchObject({ state: SessionState.Ready, chunkIndex: 0 });
    expect(step(driveTo(SessionState.WaitingForSpeech, {}, 1), cmd(Intent.Previous), 0).snapshot).toMatchObject({ state: SessionState.AssistantSpeaking, chunkIndex: 0 });
    expect(step(driveTo(SessionState.Paused, {}, 1), cmd(Intent.Next), 0).snapshot).toMatchObject({ state: SessionState.Paused, chunkIndex: 2 });
    expect(step(driveTo(SessionState.Ready, {}, 0), cmd(Intent.Previous), 0).snapshot.chunkIndex).toBe(0);
    const navigate = step(driveTo(SessionState.Ready, {}, 0), cmd(Intent.Navigate, CommandSource.Touch, { chunkId: 'c3' }), 0);
    expect(navigate.snapshot.chunkIndex).toBe(2);
    const unknown = driveTo(SessionState.Ready, {}, 0);
    expect(step(unknown, cmd(Intent.Navigate, CommandSource.Touch, { chunkId: 'nope' }), 0).snapshot).toBe(unknown);
  });

  it('T5: SPEED changes the rate within 0.5–2 and applies to the next speech; CHUNK_SIZE requests a re-chunk; HELP shows help', () => {
    let s = driveTo(SessionState.Ready);
    for (let i = 0; i < 8; i += 1) {
      s = step(s, cmd(Intent.Speed, CommandSource.Voice, { speed: 'slower' }), 0).snapshot;
    }
    expect(s.settings.rate).toBe(0.5);
    s = step(s, cmd(Intent.Speed, CommandSource.Voice, { speed: 'normal' }), 0).snapshot;
    expect(s.settings.rate).toBe(1);
    const faster = step(s, cmd(Intent.Speed, CommandSource.Voice, { speed: 'faster' }), 0);
    expect(faster.effects).toContainEqual({ type: EffectType.ApplySpeed, rate: 1.1 });
    expect(step(faster.snapshot, cmd(Intent.Start), 0).effects[0]).toMatchObject({ type: EffectType.Speak, rate: 1.1 });
    const rechunk = step(s, cmd(Intent.ChunkSize, CommandSource.Voice, { mode: 'short' }), 0);
    expect(rechunk.effects).toEqual([{ type: EffectType.RequestRechunk, fromChunkId: 'c2', mode: 'short' }]);
    expect(step(s, cmd(Intent.Help, CommandSource.Voice), 0).effects).toEqual([{ type: EffectType.ShowHelp }]);
    expect(step(s, cmd(Intent.Speed, CommandSource.Voice, { speed: 'warp' }), 0).snapshot).toBe(s);
  });

  it('T5: PLAN_CHANGED swaps in a re-chunked plan and keeps the current chunk', () => {
    const s = driveTo(SessionState.ReviewOrAdvance);
    const next = step(s, { type: EventType.PlanChanged, chunkIds: ['c1', 'n2', 'n3', 'n4'], currentChunkId: 'n2' }, 0);
    expect(next.snapshot).toMatchObject({ chunkIds: ['c1', 'n2', 'n3', 'n4'], chunkIndex: 1, state: SessionState.ReviewOrAdvance, lastTake: null });
    expect(step(s, { type: EventType.PlanChanged, chunkIds: ['x'], currentChunkId: 'missing' }, 0).snapshot).toBe(s);
  });

  it('T5: FINISH also ends a paused or reviewing session, cleaning up; a completed session ignores everything', () => {
    expect(step(driveTo(SessionState.Paused), { type: EventType.Finish }, 0).snapshot.state).toBe(SessionState.Completed);
    const done = driveTo(SessionState.Completed);
    for (const event of [cmd(Intent.Start), cmd(Intent.Next), { type: EventType.VisibilityHidden } as EngineEvent]) {
      expect(step(done, event, 0).snapshot).toBe(done);
    }
  });
});
