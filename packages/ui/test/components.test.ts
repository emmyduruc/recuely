import { CaptureState, DecisionAction, HighlightTier, ReadingState, StatusTone, type TextSpan } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import CaptureIndicator from '../app/components/CaptureIndicator.vue';
import ChunkText from '../app/components/ChunkText.vue';
import DecisionBar from '../app/components/DecisionBar.vue';
import StatusPill from '../app/components/StatusPill.vue';
import { render, textOf } from './render.ts';

const TEXT = 'Hello there, world — it’s  “fine”.';
const WORDS: TextSpan[] = [
  { charStart: 0, charEnd: 5 },
  { charStart: 6, charEnd: 12 },
  { charStart: 13, charEnd: 18 },
  { charStart: 21, charEnd: 25 },
  { charStart: 27, charEnd: 33 },
];

describe('StatusPill', () => {
  it('T11: every tone renders icon + text', async () => {
    for (const tone of Object.values(StatusTone)) {
      const html = await render(StatusPill, { tone, icon: 'i-lucide-mic', label: 'Your turn' });
      expect(html).toContain('data-icon="i-lucide-mic"');
      expect(textOf(html)).toBe('Your turn');
      expect(html).toContain(`data-tone="${tone}"`);
    }
  });
});

describe('CaptureIndicator', () => {
  const labels: Record<CaptureState, string> = {
    [CaptureState.Off]: 'Mic and camera off',
    [CaptureState.Listening]: 'Listening',
    [CaptureState.Recording]: 'Recording',
  };

  it('T11: each state shows its own icon and text in a live status region', async () => {
    const icons = new Set<string>();
    for (const state of Object.values(CaptureState)) {
      const html = await render(CaptureIndicator, { state, labels });
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(textOf(html)).toBe(labels[state]);
      icons.add(/data-icon="([^"]+)"/.exec(html)?.[1] ?? '');
    }
    expect(icons.size).toBe(Object.values(CaptureState).length);
  });
});

describe('DecisionBar', () => {
  const labels: Record<DecisionAction, string> = {
    [DecisionAction.Next]: 'Next',
    [DecisionAction.Repeat]: 'Repeat',
    [DecisionAction.Retake]: 'Retake',
  };

  it('T11: renders the three actions with icons, labels and key shortcuts', async () => {
    const html = await render(DecisionBar, { labels, groupLabel: 'After this take', suggested: DecisionAction.Next });
    for (const action of Object.values(DecisionAction)) expect(html).toContain(`data-action="${action}"`);
    expect(html.match(/data-icon=/g)).toHaveLength(3);
    expect(html).toContain('aria-keyshortcuts="ArrowRight"');
    expect(textOf(html)).toBe('RetakeTRepeatRNext→');
    expect(html).toContain('aria-label="After this take"');
  });
});

describe('ChunkText', () => {
  it('T11: the chunk tier renders no word-level markers (§A6.4)', async () => {
    for (const state of Object.values(ReadingState)) {
      const html = await render(ChunkText, { text: TEXT, tier: HighlightTier.Chunk, state, words: WORDS, currentWord: 2 });
      expect(html).not.toContain('data-word');
      expect(html).toContain('data-tier="chunk"');
      expect(textOf(html)).toBe(TEXT);
    }
  });

  it('T11: word tiers mark every word and keep the exact wording', async () => {
    for (const tier of [HighlightTier.WordProvider, HighlightTier.WordApprox]) {
      const html = await render(ChunkText, { text: TEXT, tier, state: ReadingState.Current, words: WORDS, currentWord: 2 });
      expect(html).toContain(`data-tier="${tier}"`);
      expect(html.match(/data-word="/g)).toHaveLength(WORDS.length);
      expect(html.match(/data-word-state="current"/g)).toHaveLength(1);
      expect(html).toContain('data-word="2" data-word-state="current"');
      expect(html.match(/data-word-state="spoken"/g)).toHaveLength(2);
      expect(textOf(html)).toBe(TEXT);
    }
  });

  it('T11: invalid word spans fall back to the chunk tier instead of guessing', async () => {
    const overlapping: TextSpan[] = [{ charStart: 0, charEnd: 8 }, { charStart: 6, charEnd: 12 }];
    const html = await render(ChunkText, { text: TEXT, tier: HighlightTier.WordProvider, state: ReadingState.Current, words: overlapping, currentWord: 0 });
    expect(html).toContain('data-tier="chunk"');
    expect(html).not.toContain('data-word');
  });

  it('T11: only the current chunk carries aria-current', async () => {
    const current = await render(ChunkText, { text: TEXT, tier: HighlightTier.Chunk, state: ReadingState.Current });
    const upcoming = await render(ChunkText, { text: TEXT, tier: HighlightTier.Chunk, state: ReadingState.Upcoming });
    expect(current).toContain('aria-current="true"');
    expect(upcoming).not.toContain('aria-current');
  });
});
