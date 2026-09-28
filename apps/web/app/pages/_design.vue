<script setup lang="ts">
// Development page (SPEC.md Task 11): tokens and every status component in all their states.
// Enabled by NUXT_PUBLIC_DESIGN_PAGE_ENABLED (on in `nuxt dev`); otherwise it's a 404.
import {
  CaptureState,
  DecisionAction,
  HighlightTier,
  ReadingState,
  SessionState,
  type TextSpan,
} from '@repo/contracts';
import type { MessageKey } from '~/utils/message-key';

definePageMeta({
  middleware: [
    () => {
      if (!useRuntimeConfig().public.designPageEnabled) return abortNavigation(createError({ statusCode: 404 }));
      return undefined;
    },
  ],
});

const t = useT();
useHead({ title: () => t('design.title') });

const COLOR_TOKENS = [
  'canvas', 'surface-1', 'surface-2', 'border', 'border-strong', 'text', 'text-muted', 'text-subtle',
  'accent', 'success', 'warning', 'error', 'live', 'live-solid', 'listening', 'assistant', 'focus',
  'hl-current-bg', 'hl-spoken', 'hl-upcoming',
] as const;

const UI_SCALE = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'] as const;
const PROMPTER_SCALE = ['text-prompter-1', 'text-prompter-2', 'text-prompter-3', 'text-prompter-4', 'text-prompter-5'] as const;

const STATUS_PARAMS = { current: 3, total: 12, take_number: 2 };

const captureLabels = computed(() => translateRecord(CAPTURE_LABEL, t));
const decisionLabels = computed(() => translateRecord(DECISION_LABEL, t));
const lastChoice = ref<DecisionAction | null>(null);

const TIER_LABEL: Record<HighlightTier, MessageKey> = {
  [HighlightTier.WordProvider]: 'design.tier.word_provider',
  [HighlightTier.WordApprox]: 'design.tier.word_approx',
  [HighlightTier.Chunk]: 'design.tier.chunk',
};

const READING_LABEL: Record<ReadingState, MessageKey> = {
  [ReadingState.Spoken]: 'design.reading.spoken',
  [ReadingState.Current]: 'design.reading.current',
  [ReadingState.Upcoming]: 'design.reading.upcoming',
};

const sampleChunk = computed(() => t('design.sample_chunk'));
/** Demo word spans over the sample; in the studio they come from TTS timings. */
const sampleWords = computed<TextSpan[]>(() =>
  [...sampleChunk.value.matchAll(/\S+/g)].map((m) => ({ charStart: m.index, charEnd: m.index + m[0].length })),
);
const SAMPLE_CURRENT_WORD = 4;
</script>

<template>
  <div class="flex flex-col gap-10">
    <header class="flex flex-col gap-2">
      <h1 class="text-3xl font-semibold">
        {{ t('design.title') }}
      </h1>
      <p class="text-ink-muted">
        {{ t('design.intro') }}
      </p>
    </header>

    <section
      class="flex flex-col gap-4"
      aria-labelledby="design-colors"
    >
      <h2
        id="design-colors"
        class="text-xl font-semibold"
      >
        {{ t('design.colors') }}
      </h2>
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <li
          v-for="token in COLOR_TOKENS"
          :key="token"
          class="flex flex-col gap-2 rounded-md border border-line bg-surface-1 p-2"
        >
          <span
            class="h-12 rounded-sm border border-line"
            :style="{ background: `var(--rc-${token})` }"
            aria-hidden="true"
          />
          <code class="text-xs break-all text-ink-muted">{{ `--rc-${token}` }}</code>
        </li>
      </ul>
    </section>

    <section
      class="flex flex-col gap-4"
      aria-labelledby="design-typography"
    >
      <h2
        id="design-typography"
        class="text-xl font-semibold"
      >
        {{ t('design.typography') }}
      </h2>
      <h3 class="font-semibold text-ink-muted">
        {{ t('design.ui_scale') }}
      </h3>
      <p
        v-for="size in UI_SCALE"
        :key="size"
        :class="size"
      >
        <code class="mr-3 text-xs text-ink-subtle">{{ size }}</code>{{ t('design.sample_text') }}
      </p>
      <h3 class="font-semibold text-ink-muted">
        {{ t('design.prompter_scale') }}
      </h3>
      <p
        v-for="size in PROMPTER_SCALE"
        :key="size"
        class="leading-tight font-semibold [overflow-wrap:anywhere]"
        :class="size"
      >
        {{ t('design.sample_text') }}
      </p>
    </section>

    <section
      class="flex flex-col gap-4"
      aria-labelledby="design-statuses"
    >
      <h2
        id="design-statuses"
        class="text-xl font-semibold"
      >
        {{ t('design.statuses') }}
      </h2>
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="state in Object.values(SessionState)"
          :key="state"
          :data-session-state="state"
        >
          <StatusPill
            :tone="STUDIO_STATUS[state].tone"
            :icon="STUDIO_STATUS[state].icon"
            :label="t(STUDIO_STATUS[state].label, STATUS_PARAMS)"
          />
        </li>
      </ul>
    </section>

    <section
      class="flex flex-col gap-4"
      aria-labelledby="design-capture"
    >
      <h2
        id="design-capture"
        class="text-xl font-semibold"
      >
        {{ t('design.capture') }}
      </h2>
      <div class="flex flex-wrap gap-3">
        <CaptureIndicator
          v-for="state in Object.values(CaptureState)"
          :key="state"
          :state="state"
          :labels="captureLabels"
        />
      </div>
    </section>

    <section
      class="flex flex-col gap-4"
      aria-labelledby="design-decisions"
    >
      <h2
        id="design-decisions"
        class="text-xl font-semibold"
      >
        {{ t('design.decisions') }}
      </h2>
      <DecisionBar
        :labels="decisionLabels"
        :group-label="t('studio.decision.group')"
        :suggested="DecisionAction.Next"
        @choose="lastChoice = $event"
      />
      <p
        class="text-sm text-ink-muted"
        aria-live="polite"
        data-last-choice
      >
        <template v-if="lastChoice !== null">
          {{ t('design.last_choice', { action: decisionLabels[lastChoice] }) }}
        </template>
      </p>
    </section>

    <section
      class="flex flex-col gap-6"
      aria-labelledby="design-highlight"
    >
      <h2
        id="design-highlight"
        class="text-xl font-semibold"
      >
        {{ t('design.highlight') }}
      </h2>
      <div
        v-for="tier in Object.values(HighlightTier)"
        :key="tier"
        class="flex flex-col gap-2 rounded-lg border border-line bg-surface-1 p-4"
        :data-demo-tier="tier"
      >
        <h3 class="text-sm font-semibold text-ink-muted">
          {{ t(TIER_LABEL[tier]) }}
        </h3>
        <ChunkText
          class="text-prompter-1 leading-snug font-semibold"
          :text="sampleChunk"
          :tier="tier"
          :state="ReadingState.Current"
          :words="sampleWords"
          :current-word="SAMPLE_CURRENT_WORD"
        />
      </div>
      <div class="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-4">
        <div
          v-for="state in Object.values(ReadingState)"
          :key="state"
          class="flex flex-col gap-1"
        >
          <span class="text-xs font-semibold text-ink-subtle">{{ t(READING_LABEL[state]) }}</span>
          <ChunkText
            class="text-xl"
            :text="sampleChunk"
            :tier="HighlightTier.Chunk"
            :state="state"
          />
        </div>
      </div>
    </section>
  </div>
</template>
