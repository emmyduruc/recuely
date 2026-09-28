import { type CommandEvent, CommandSource, type Intent, MatchDecision, SessionState } from '@repo/contracts';
import {
  createSnapshot,
  type Effect,
  type EngineEvent,
  type EngineSettings,
  type EngineSnapshot,
  EventType,
  step,
  type Step,
} from '../src/index.ts';

export const CHUNKS = ['c1', 'c2', 'c3'] as const;

export function cmd(intent: Intent, source: CommandEvent['source'] = CommandSource.Touch, args?: Record<string, string>): EngineEvent {
  return { type: EventType.Command, command: { intent, source, ...(args === undefined ? {} : { args }) } };
}

/** Applies events in order (1 s apart unless given), returning the final step and every effect. */
export function run(snapshot: EngineSnapshot, events: readonly EngineEvent[], start = 10_000): Step & { all: Effect[] } {
  let current: Step = { snapshot, effects: [] };
  const all: Effect[] = [];
  events.forEach((event, index) => {
    current = step(current.snapshot, event, start + index * 1000);
    all.push(...current.effects);
  });
  return { ...current, all };
}

function tokenOf(value: { token: number } | null): number {
  if (value === null) {
    throw new Error('expected a pending token');
  }
  return value.token;
}

/** The event that moves a snapshot one step along the happy path, per state. */
const FORWARD: Partial<Record<SessionState, (s: EngineSnapshot) => EngineEvent>> = {
  [SessionState.Idle]: () => ({ type: EventType.Prepare }),
  [SessionState.Preparing]: () => ({ type: EventType.CapsReady, minCapsMet: true }),
  [SessionState.Ready]: () => cmd('START'),
  [SessionState.AssistantSpeaking]: (s) => ({ type: EventType.TtsEnded, token: tokenOf(s.speech) }),
  [SessionState.Settle]: (s) => ({ type: EventType.Timer, token: tokenOf(s.timer) }),
  [SessionState.WaitingForSpeech]: (s) => ({ type: EventType.VadStart, token: tokenOf(s.capture) }),
};

const ORDER: SessionState[] = [
  SessionState.Idle,
  SessionState.Preparing,
  SessionState.Ready,
  SessionState.AssistantSpeaking,
  SessionState.Settle,
  SessionState.WaitingForSpeech,
  SessionState.CreatorSpeaking,
];

/**
 * A real snapshot in `target`, reached by driving the engine from idle, on chunk `index` (default: the middle
 * one, so NEXT and PREVIOUS both have somewhere to go).
 */
export function driveTo(target: SessionState, settings: Partial<EngineSettings> = {}, index = 1): EngineSnapshot {
  let s = createSnapshot(CHUNKS, settings);
  const go = (event: EngineEvent): void => {
    s = step(s, event, 1).snapshot;
  };
  go({ type: EventType.Prepare });
  go({ type: EventType.CapsReady, minCapsMet: true });
  if (index > 0) {
    go(cmd('NAVIGATE', CommandSource.Touch, { chunkId: CHUNKS[index] ?? 'c1' }));
  }
  const special: Partial<Record<SessionState, () => void>> = {
    [SessionState.Idle]: () => {
      s = createSnapshot(CHUNKS, settings);
    },
    [SessionState.Preparing]: () => {
      s = step(createSnapshot(CHUNKS, settings), { type: EventType.Prepare }, 1).snapshot;
    },
    [SessionState.Error]: () => {
      s = step(step(createSnapshot(CHUNKS, settings), { type: EventType.Prepare }, 1).snapshot, { type: EventType.CapsFailed }, 1).snapshot;
    },
    [SessionState.Evaluating]: () => {
      s = driveTo(SessionState.CreatorSpeaking, settings, index);
      go({ type: EventType.VadEnd, token: tokenOf(s.capture) });
      go({ type: EventType.Timer, token: tokenOf(s.timer) });
    },
    [SessionState.ReviewOrAdvance]: () => {
      s = driveTo(SessionState.Evaluating, settings, index);
      go({ type: EventType.EvalResult, token: tokenOf(s.evaluation), chunkId: s.evaluation?.chunkId ?? '', decision: MatchDecision.Ask });
    },
    [SessionState.Paused]: () => {
      go(cmd('PAUSE'));
    },
    [SessionState.Recovering]: () => {
      go({ type: EventType.DeviceLost });
    },
    [SessionState.Completed]: () => {
      go({ type: EventType.Finish });
    },
  };
  const custom = special[target];
  if (custom !== undefined) {
    custom();
  } else {
    while (s.state !== target) {
      const forward = FORWARD[s.state];
      if (forward === undefined || !ORDER.includes(target)) {
        throw new Error(`cannot drive to ${target}`);
      }
      go(forward(s));
    }
  }
  if (s.state !== target) {
    throw new Error(`drove to ${s.state}, wanted ${target}`);
  }
  return s;
}

export function types(effects: readonly Effect[]): string[] {
  return effects.map((effect) => effect.type);
}
