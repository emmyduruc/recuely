import { Arrangement, CommandSource, Intent, MatchDecision, SessionState } from '@repo/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createSnapshot,
  type Effect,
  EffectType,
  type EngineEvent,
  type EngineSnapshot,
  EventType,
  step,
  TakeEnd,
  TimerKind,
} from '../src/index.ts';

// SPEC.md §B6 invariants, property-tested over random event sequences (1,000 runs each). Events are built
// against the current snapshot: usually with the right token, sometimes with a stale or random one.
const RUNS = 1000;

const SIMPLE_KINDS = ['prepare', 'capsReady', 'capsFailed', 'finish', 'hidden', 'deviceLost', 'revoked', 'restored'] as const;
const TOKEN_KINDS = ['ttsEnded', 'ttsFailed', 'timer', 'vadStart', 'vadEnd', 'evalFailed'] as const;
type SimpleKind = (typeof SIMPLE_KINDS)[number];
type TokenKind = (typeof TOKEN_KINDS)[number];

/** One member per kind, so `Extract<Action, { kind: K }>` narrows. */
type Action =
  | { [K in SimpleKind]: { kind: K } }[SimpleKind]
  | { [K in TokenKind]: { kind: K; stale: boolean } }[TokenKind]
  | { kind: 'evalResult'; stale: boolean; advance: boolean }
  | { kind: 'command'; intent: Intent; voice: boolean; isolated: boolean; target: number };

/** Stale about 30% of the time; deterministic, so fast-check can shrink failures. */
const stale = fc.integer({ min: 0, max: 9 }).map((n) => n < 3);
const action: fc.Arbitrary<Action> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom(...SIMPLE_KINDS).map((kind): Action => ({ kind })) },
  { weight: 6, arbitrary: fc.tuple(fc.constantFrom(...TOKEN_KINDS), stale).map(([kind, isStale]): Action => ({ kind, stale: isStale })) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('evalResult' as const), stale, advance: fc.boolean() }) },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('command' as const),
      intent: fc.constantFrom(...Object.values(Intent)),
      voice: fc.boolean(),
      isolated: fc.boolean(),
      target: fc.nat({ max: 3 }),
    }),
  },
);

function token(value: { token: number } | null, isStale: boolean, s: EngineSnapshot): number {
  return value === null || isStale ? Math.max(0, s.nextToken - 3) : value.token;
}

const ARGS: Partial<Record<Intent, (target: number) => Record<string, string>>> = {
  [Intent.Navigate]: (target) => ({ chunkId: `c${String(target + 1)}` }),
  [Intent.Speed]: (target) => ({ speed: ['slower', 'faster', 'normal', 'bad'][target] ?? 'normal' }),
  [Intent.ChunkSize]: (target) => ({ mode: ['short', 'sentence', 'paragraph', 'smart'][target] ?? 'short' }),
};

type Builder<K extends Action['kind']> = (a: Extract<Action, { kind: K }>, s: EngineSnapshot) => EngineEvent;

const BUILD: { [K in Action['kind']]: Builder<K> } = {
  prepare: () => ({ type: EventType.Prepare }),
  capsReady: () => ({ type: EventType.CapsReady, minCapsMet: true }),
  capsFailed: () => ({ type: EventType.CapsFailed }),
  finish: () => ({ type: EventType.Finish }),
  hidden: () => ({ type: EventType.VisibilityHidden }),
  deviceLost: () => ({ type: EventType.DeviceLost }),
  revoked: () => ({ type: EventType.PermissionRevoked }),
  restored: () => ({ type: EventType.DeviceRestored }),
  ttsEnded: (a, s) => ({ type: EventType.TtsEnded, token: token(s.speech, a.stale, s) }),
  ttsFailed: (a, s) => ({ type: EventType.TtsFailed, token: token(s.speech, a.stale, s) }),
  timer: (a, s) => ({ type: EventType.Timer, token: token(s.timer, a.stale, s) }),
  vadStart: (a, s) => ({ type: EventType.VadStart, token: token(s.capture, a.stale, s) }),
  vadEnd: (a, s) => ({ type: EventType.VadEnd, token: token(s.capture, a.stale, s) }),
  evalFailed: (a, s) => ({ type: EventType.EvalFailed, token: token(s.evaluation, a.stale, s) }),
  evalResult: (a, s) => ({
    type: EventType.EvalResult,
    token: token(s.evaluation, a.stale, s),
    chunkId: s.evaluation?.chunkId ?? 'c1',
    decision: a.advance ? MatchDecision.Advance : MatchDecision.Ask,
  }),
  command: (a) => {
    const args = ARGS[a.intent]?.(a.target);
    return {
      type: EventType.Command,
      command: { intent: a.intent, source: a.voice ? CommandSource.Voice : CommandSource.Touch, ...(args === undefined ? {} : { args }) },
      ...(a.isolated ? { speechGate: { durationMs: 800, exactGrammarMatch: true, chunkSimilarity: 0.1 } } : {}),
    };
  },
};

function toEvent(a: Action, s: EngineSnapshot): EngineEvent {
  // BUILD is keyed by kind, so each builder receives its own action shape (same pattern as the engine).
  const build = BUILD[a.kind] as (a: Action, s: EngineSnapshot) => EngineEvent;
  return build(a, s);
}

interface Trace {
  before: EngineSnapshot;
  event: EngineEvent;
  after: EngineSnapshot;
  effects: Effect[];
}

const settings = fc.record({
  arrangement: fc.constantFrom(...Object.values(Arrangement)),
  autoAdvance: fc.boolean(),
  captureVideo: fc.boolean(),
});

/** Runs a random session and returns every step. */
function simulate(config: { arrangement: Arrangement; autoAdvance: boolean; captureVideo: boolean }, actions: readonly Action[]): Trace[] {
  let s = createSnapshot(['c1', 'c2', 'c3'], config);
  // Start most runs in a working session so the interesting states are reached often.
  for (const event of [{ type: EventType.Prepare }, { type: EventType.CapsReady, minCapsMet: true }] as EngineEvent[]) {
    s = step(s, event, 0).snapshot;
  }
  return actions.map((a, index) => {
    const event = toEvent(a, s);
    const result = step(s, event, index * 250);
    const trace = { before: s, event, after: result.snapshot, effects: result.effects };
    s = result.snapshot;
    return trace;
  });
}

const PENDING = ['speech', 'timer', 'capture', 'take', 'evaluation'] as const;
/** Effects that end a pending operation, by the operation they end. */
const ENDED_BY: Record<(typeof PENDING)[number], readonly string[]> = {
  speech: [EffectType.CancelSpeech],
  timer: [EffectType.CancelTimer],
  capture: [EffectType.DisarmCapture],
  take: [EffectType.StopTake],
  evaluation: [EffectType.CancelEvaluation],
};
const TIMER_STATE: Record<TimerKind, SessionState> = {
  [TimerKind.Settle]: SessionState.Settle,
  [TimerKind.NoSpeech]: SessionState.WaitingForSpeech,
  [TimerKind.Silence]: SessionState.CreatorSpeaking,
  [TimerKind.EvalTimeout]: SessionState.Evaluating,
};
const MIC_STATES = new Set<SessionState>([SessionState.WaitingForSpeech, SessionState.CreatorSpeaking]);

function eventToken(event: EngineEvent): number | undefined {
  return 'token' in event ? event.token : undefined;
}

function effectToken(effect: Effect): number | undefined {
  return 'token' in effect ? effect.token : undefined;
}

const sequences = fc.tuple(settings, fc.array(action, { minLength: 1, maxLength: 60 }));

describe('§B6 invariants (fast-check, 1,000 runs each)', () => {
  it('B6-I1: leaving a state (or finishing an operation) cancels its timers and in-flight requests', () => {
    fc.assert(
      fc.property(sequences, ([config, actions]) => {
        for (const { before, event, after, effects } of simulate(config, actions)) {
          for (const key of PENDING) {
            const was = before[key];
            if (was === null || after[key]?.token === was.token) {
              continue;
            }
            // It ended: either the event delivered its result, or an effect cancelled/stopped it.
            const consumed = eventToken(event) === was.token;
            const cancelled = effects.some((effect) => ENDED_BY[key].includes(effect.type) && effectToken(effect) === was.token);
            expect(consumed || cancelled, `${key} ${String(was.token)} after ${event.type}`).toBe(true);
          }
          // Pending work always belongs to the current state.
          if (after.timer !== null) {
            expect(TIMER_STATE[after.timer.kind]).toBe(after.state);
          }
          expect(after.speech === null || after.state === SessionState.AssistantSpeaking).toBe(true);
          expect(after.evaluation === null || after.state === SessionState.Evaluating).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('B6-I2: every started take is stopped exactly once (the runner persists it), and committed at most once', () => {
    fc.assert(
      fc.property(sequences, ([config, actions]) => {
        const traces = simulate(config, actions);
        const last = traces.at(-1)?.after;
        // End the session so any take still recording must be stopped.
        const closing = last === undefined ? [] : step(last, { type: EventType.DeviceLost }, 1e9).effects;
        const effects = [...traces.flatMap((t) => t.effects), ...closing];
        const started = effects.filter((e) => e.type === EffectType.StartTake).map(effectToken);
        const stopped = effects.filter((e) => e.type === EffectType.StopTake).map(effectToken);
        expect([...stopped].sort()).toEqual([...started].sort());
        const commits = effects.flatMap((e) => (e.type === EffectType.CommitTake ? [e.takeToken] : []));
        expect(new Set(commits).size).toBe(commits.length);
        const completed = effects.flatMap((e) => (e.type === EffectType.StopTake && e.end === TakeEnd.Complete ? [e.token] : []));
        expect(commits.every((take) => completed.includes(take))).toBe(true);
        for (const { after } of traces) {
          expect(after.take === null || after.state === SessionState.CreatorSpeaking).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('B6-I3: the mic is armed only in waiting_for_speech / creator_speaking, never while paused, recovering or in error', () => {
    fc.assert(
      fc.property(sequences, ([config, actions]) => {
        for (const { after } of simulate(config, actions)) {
          expect(after.capture === null || MIC_STATES.has(after.state), after.state).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('B6-I4: nothing is captured during assistant_speaking (A1 included)', () => {
    fc.assert(
      fc.property(sequences, ([config, actions]) => {
        for (const { after, effects } of simulate(config, actions)) {
          if (after.state === SessionState.AssistantSpeaking) {
            expect(after.capture).toBeNull();
            expect(after.take).toBeNull();
            expect(effects.some((e) => e.type === EffectType.ArmCapture || e.type === EffectType.StartTake)).toBe(false);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('B6-I5: seq strictly increases with every accepted event; ignored events change nothing', () => {
    fc.assert(
      fc.property(sequences, ([config, actions]) => {
        for (const { before, after, effects } of simulate(config, actions)) {
          if (after === before) {
            expect(effects).toEqual([]);
          } else {
            expect(after.seq).toBe(before.seq + 1);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('T5-P: a stale token never changes anything (stale guard, E10)', () => {
    fc.assert(
      fc.property(sequences, ([config, actions]) => {
        for (const { before, event, after } of simulate(config, actions)) {
          const t = eventToken(event);
          const live = PENDING.some((key) => before[key]?.token === t);
          if (t !== undefined && !live) {
            expect(after).toBe(before);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });
});
