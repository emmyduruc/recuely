import { readdirSync, readFileSync } from 'node:fs';
import { MatchDecision, SessionState } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { createSnapshot, type Effect, EffectType, type EngineEvent, type EngineSettings, type EngineSnapshot, step, TakeEnd } from '../src/index.ts';

// Golden event-log replays (SPEC.md Task 5): hand-written logs in tests/fixtures/golden with the expected
// state, chunk and effects after every event. A change in engine behaviour shows up as a diff here.

interface GoldenStep {
  at: number;
  event: EngineEvent;
  state: SessionState;
  chunkIndex: number;
  effects: string[];
  note?: string;
}

interface Golden {
  scenario: string;
  description: string;
  settings: EngineSettings;
  chunkIds: string[];
  steps: GoldenStep[];
}

const DIR = new URL('../../../tests/fixtures/golden/', import.meta.url);

function load(file: string): Golden {
  return JSON.parse(readFileSync(new URL(file, DIR), 'utf8')) as Golden;
}

function replay(golden: Golden): { snapshot: EngineSnapshot; effects: Effect[] } {
  let snapshot = createSnapshot(golden.chunkIds, golden.settings);
  const effects: Effect[] = [];
  for (const [index, expected] of golden.steps.entries()) {
    const result = step(snapshot, expected.event, expected.at);
    const where = `${golden.scenario} step ${String(index + 1)} (${expected.event.type})${expected.note === undefined ? '' : `: ${expected.note}`}`;
    expect({ state: result.snapshot.state, chunkIndex: result.snapshot.chunkIndex, effects: result.effects.map((e) => e.type) }, where).toEqual({
      state: expected.state,
      chunkIndex: expected.chunkIndex,
      effects: expected.effects,
    });
    snapshot = result.snapshot;
    effects.push(...result.effects);
  }
  return { snapshot, effects };
}

function spokenChunks(effects: readonly Effect[]): string[] {
  return effects.flatMap((effect) => (effect.type === EffectType.Speak ? [effect.chunkId] : []));
}

describe('golden event-log replays', () => {
  it('T5: every golden log in tests/fixtures/golden replays exactly', () => {
    const files = readdirSync(DIR).filter((file) => file.endsWith('.json'));
    expect(files.sort()).toEqual(['e10-late-result.json', 'e3-mid-sentence-pause.json']);
    for (const file of files) {
      replay(load(file));
    }
  });

  it('T5-E3: a mid-sentence pause never advances and never erases speech', () => {
    const { snapshot, effects } = replay(load('e3-mid-sentence-pause.json'));
    expect(snapshot).toMatchObject({ state: SessionState.ReviewOrAdvance, chunkIndex: 0 });
    // One take for the whole line (the short pause didn't split or drop it), stopped complete and committed.
    const starts = effects.filter((e) => e.type === EffectType.StartTake);
    expect(starts).toHaveLength(1);
    expect(effects).toContainEqual({ type: EffectType.StopTake, token: 5, end: TakeEnd.Complete });
    expect(effects).toContainEqual({ type: EffectType.CommitTake, takeToken: 5, chunkId: 'c1', decision: MatchDecision.Ask });
    expect(spokenChunks(effects)).toEqual(['c1']);
  });

  it('T5-E10: a late transcription for chunk 1 does not advance chunk 2', () => {
    const { snapshot, effects } = replay(load('e10-late-result.json'));
    expect(snapshot).toMatchObject({ state: SessionState.AssistantSpeaking, chunkIndex: 1 });
    expect(snapshot.chunkIds[snapshot.chunkIndex]).toBe('c2');
    expect(spokenChunks(effects)).toEqual(['c1', 'c2']);
    // The timed-out take was still committed (without a decision), so nothing was lost.
    expect(effects).toContainEqual({ type: EffectType.CommitTake, takeToken: 5, chunkId: 'c1', decision: null });
  });
});
