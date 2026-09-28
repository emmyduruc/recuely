<script setup lang="ts">
// After a take: Next · Repeat · Retake (SPEC.md §B9), with the keyboard shortcuts of §B9.
import { DecisionAction } from '@repo/contracts';

const props = withDefaults(
  defineProps<{
    /** Translated button labels. */
    labels: Record<DecisionAction, string>;
    /** Translated accessible name of the group. */
    groupLabel: string;
    /** The action the matcher suggests; shown as the primary button. */
    suggested?: DecisionAction | null;
    disabled?: boolean;
  }>(),
  { suggested: null, disabled: false },
);

const emit = defineEmits<{ choose: [action: DecisionAction] }>();

const ORDER: readonly DecisionAction[] = [DecisionAction.Retake, DecisionAction.Repeat, DecisionAction.Next];

const ICON: Record<DecisionAction, string> = {
  [DecisionAction.Next]: 'i-lucide-arrow-right',
  [DecisionAction.Repeat]: 'i-lucide-repeat',
  [DecisionAction.Retake]: 'i-lucide-rotate-ccw',
};

/** Key caps, not words (§B9: → next, R repeat, T retake). */
const SHORTCUT: Record<DecisionAction, string> = {
  [DecisionAction.Next]: '→',
  [DecisionAction.Repeat]: 'R',
  [DecisionAction.Retake]: 'T',
};

const ARIA_SHORTCUT: Record<DecisionAction, string> = {
  [DecisionAction.Next]: 'ArrowRight',
  [DecisionAction.Repeat]: 'R',
  [DecisionAction.Retake]: 'T',
};

const PRIMARY = 'border-accent bg-accent text-on-accent';
const SECONDARY = 'border-line-strong bg-surface-2 text-ink';

function buttonClass(action: DecisionAction): string {
  return action === props.suggested ? PRIMARY : SECONDARY;
}
</script>

<template>
  <div
    role="group"
    :aria-label="props.groupLabel"
    class="flex flex-wrap gap-2"
  >
    <button
      v-for="action in ORDER"
      :key="action"
      type="button"
      class="inline-flex min-h-target min-w-target flex-1 items-center justify-center gap-2 rounded-md border px-4 font-semibold transition-colors duration-(--rc-motion-fast) disabled:opacity-50"
      :class="buttonClass(action)"
      :disabled="props.disabled"
      :aria-keyshortcuts="ARIA_SHORTCUT[action]"
      :data-action="action"
      @click="emit('choose', action)"
    >
      <UIcon
        :name="ICON[action]"
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      <span>{{ props.labels[action] }}</span>
      <kbd
        class="rounded-sm border border-current px-1.5 text-xs opacity-80"
        aria-hidden="true"
      >{{ SHORTCUT[action] }}</kbd>
    </button>
  </div>
</template>
