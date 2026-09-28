<script setup lang="ts">
// Always-visible capture status (SPEC.md §A6.1): the creator can tell at a glance whether the
// mic is armed or a take is recording. Icon + text + color; announced politely to screen readers.
import { CaptureState } from '@repo/contracts';

const props = defineProps<{
  state: CaptureState;
  /** Translated label per state. */
  labels: Record<CaptureState, string>;
}>();

const ICON: Record<CaptureState, string> = {
  [CaptureState.Off]: 'i-lucide-mic-off',
  [CaptureState.Listening]: 'i-lucide-mic',
  [CaptureState.Recording]: 'i-lucide-circle-dot',
};

const STATE_CLASS: Record<CaptureState, string> = {
  [CaptureState.Off]: 'border-line bg-surface-2 text-ink-muted',
  [CaptureState.Listening]: 'border-listening bg-surface-2 text-listening',
  [CaptureState.Recording]: 'border-live-solid bg-live-solid text-on-live',
};

const DOT_CLASS: Record<CaptureState, string> = {
  [CaptureState.Off]: 'hidden',
  [CaptureState.Listening]: 'bg-listening',
  [CaptureState.Recording]: 'bg-on-live motion-safe:animate-pulse',
};
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="inline-flex min-h-target items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors duration-(--rc-motion-base)"
    :class="STATE_CLASS[props.state]"
    :data-capture-state="props.state"
  >
    <span
      class="size-2 rounded-full"
      :class="DOT_CLASS[props.state]"
      aria-hidden="true"
    />
    <UIcon
      :name="ICON[props.state]"
      class="size-4 shrink-0"
      aria-hidden="true"
      data-status-icon
    />
    <span data-status-label>{{ props.labels[props.state] }}</span>
  </div>
</template>
