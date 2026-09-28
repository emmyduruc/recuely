<script setup lang="ts">
// The text of one chunk with the assistant highlight (SPEC.md §B7 tiers):
// `word-provider` and `word-approx` mark words from real timings; `chunk` highlights the whole
// chunk and renders no word-level markers (§A6.4). Invalid word spans fall back to `chunk`.
import { HighlightTier, ReadingState, type TextSpan } from '@repo/contracts';
import { computed } from 'vue';
import { chunkSegments } from '../../src/chunk-segments.ts';

const props = withDefaults(
  defineProps<{
    text: string;
    tier: HighlightTier;
    /** Where this chunk is relative to the reading position. */
    state: ReadingState;
    /** Word spans (UTF-16 offsets into `text`); ignored for the `chunk` tier. */
    words?: readonly TextSpan[];
    /** The word being spoken, when `state` is current. */
    currentWord?: number | null;
  }>(),
  { words: () => [], currentWord: null },
);

const segments = computed(() =>
  props.tier === HighlightTier.Chunk ? null : chunkSegments(props.text, props.words, props.state, props.currentWord),
);

const renderedTier = computed<HighlightTier>(() => (segments.value === null ? HighlightTier.Chunk : props.tier));

const CHUNK_CLASS: Record<ReadingState, string> = {
  [ReadingState.Spoken]: 'text-hl-spoken',
  [ReadingState.Current]: 'text-ink bg-surface-2 rounded-sm shadow-[0_0_0_4px_var(--rc-surface-2)]',
  [ReadingState.Upcoming]: 'text-hl-upcoming',
};

/** Provider timings are exact, so the current word gets the full highlight; approximate ones an underline. */
const WORD_CLASS: Record<Exclude<HighlightTier, typeof HighlightTier.Chunk>, Record<ReadingState, string>> = {
  [HighlightTier.WordProvider]: {
    [ReadingState.Spoken]: 'text-hl-spoken',
    [ReadingState.Current]: 'bg-hl-current-bg text-hl-current-fg rounded-sm',
    [ReadingState.Upcoming]: 'text-hl-upcoming',
  },
  [HighlightTier.WordApprox]: {
    [ReadingState.Spoken]: 'text-hl-spoken',
    [ReadingState.Current]: 'text-ink underline decoration-hl-current-bg decoration-4 underline-offset-8',
    [ReadingState.Upcoming]: 'text-hl-upcoming',
  },
};

function wordClass(state: ReadingState): string {
  return props.tier === HighlightTier.Chunk ? '' : WORD_CLASS[props.tier][state];
}
</script>

<template>
  <p
    class="whitespace-pre-wrap transition-colors duration-(--rc-motion-fast)"
    :data-tier="renderedTier"
    :data-state="props.state"
    :aria-current="props.state === ReadingState.Current ? 'true' : undefined"
  >
    <span
      v-if="segments === null"
      :class="CHUNK_CLASS[props.state]"
      data-chunk-text
    >{{ props.text }}</span>
    <template v-else>
      <span
        v-for="(segment, index) in segments"
        :key="index"
        :class="segment.word === null ? CHUNK_CLASS[segment.state] : wordClass(segment.state)"
        :data-word="segment.word ?? undefined"
        :data-word-state="segment.word === null ? undefined : segment.state"
      >{{ segment.text }}</span>
    </template>
  </p>
</template>
