<script setup lang="ts">
// A status is never color alone: icon + text + tone (SPEC.md §B9 status language).
import { StatusTone } from '@repo/contracts';

const props = defineProps<{
  tone: StatusTone;
  /** Iconify name, e.g. `i-lucide-mic`. */
  icon: string;
  /** Already translated text (components are props-only; the app owns i18n). */
  label: string;
}>();

const TONE_CLASS: Record<StatusTone, string> = {
  [StatusTone.Neutral]: 'text-ink-muted border-line',
  [StatusTone.Accent]: 'text-accent border-accent',
  [StatusTone.Assistant]: 'text-assistant border-assistant',
  [StatusTone.Listening]: 'text-listening border-listening',
  [StatusTone.Live]: 'text-live border-live',
  [StatusTone.Success]: 'text-success border-success',
  [StatusTone.Warning]: 'text-warning border-warning',
  [StatusTone.Error]: 'text-error border-error',
};
</script>

<template>
  <span
    class="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-surface-2 px-3 py-1 text-sm font-medium"
    :class="TONE_CLASS[props.tone]"
    :data-tone="props.tone"
    data-status-pill
  >
    <UIcon
      :name="props.icon"
      class="size-4 shrink-0"
      aria-hidden="true"
      data-status-icon
    />
    <span data-status-label>{{ props.label }}</span>
  </span>
</template>
