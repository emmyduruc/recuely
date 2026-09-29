<script setup lang="ts">
// Chunk boundary editing (SPEC.md Task 12). Mouse: click a word to split before it, drag a boundary handle
// onto a word to move it, or use the merge button. Keyboard: Enter on a chunk starts split mode (arrows pick
// the word, Enter splits, Escape cancels); on a boundary, arrow keys move it by a word and Delete merges.
import { type ChunkPlan, KeyboardKey, type ScriptBlock } from '@repo/contracts';
import { type BlockPosition, BoundaryStep } from '@repo/script-model';
import { chunkWords } from '~/utils/script-review';

const props = defineProps<{ blocks: readonly ScriptBlock[]; plan: ChunkPlan }>();
const emit = defineEmits<{
  split: [chunkId: string, at: BlockPosition];
  merge: [chunkId: string];
  move: [chunkId: string, at: BlockPosition];
  nudge: [chunkId: string, step: BoundaryStep];
}>();

const t = useT();

const chunks = computed(() => props.plan.chunks.map((chunk) => ({ chunk, words: chunkWords(props.blocks, chunk) })));
const total = computed(() => chunks.value.length);

/** Split mode: which chunk and the word the split would start at. */
const splitting = ref<{ index: number; word: number } | null>(null);

const BOUNDARY_KEYS: Partial<Record<string, BoundaryStep>> = {
  [KeyboardKey.ArrowUp]: BoundaryStep.Earlier,
  [KeyboardKey.ArrowLeft]: BoundaryStep.Earlier,
  [KeyboardKey.ArrowDown]: BoundaryStep.Later,
  [KeyboardKey.ArrowRight]: BoundaryStep.Later,
};
const MERGE_KEYS = new Set<string>([KeyboardKey.Delete, KeyboardKey.Backspace]);

const root = useTemplateRef<HTMLElement>('root');

/** Chunk ids change when an edit touches them, so focus is restored by position after the re-render. */
async function focusAfterEdit(selector: string): Promise<void> {
  await nextTick();
  root.value?.querySelector<HTMLElement>(selector)?.focus();
}

function onBoundaryKey(event: KeyboardEvent, index: number): void {
  const entry = chunks.value[index];
  if (entry === undefined) return;
  const step = BOUNDARY_KEYS[event.key];
  if (step !== undefined) {
    event.preventDefault();
    emit('nudge', entry.chunk.id, step);
    void focusAfterEdit(`[data-boundary-index="${String(index)}"]`);
    return;
  }
  if (MERGE_KEYS.has(event.key)) {
    event.preventDefault();
    merge(index);
  }
}

function merge(index: number): void {
  const previous = chunks.value[index - 1];
  if (previous === undefined) return;
  emit('merge', previous.chunk.id);
  void focusAfterEdit(`[data-chunk-index="${String(index - 1)}"]`);
}

function splitAt(index: number, word: number): void {
  const entry = chunks.value[index];
  const target = entry?.words[word];
  if (entry === undefined || target === undefined || word === 0) return;
  emit('split', entry.chunk.id, { blockId: target.blockId, offset: target.start });
  splitting.value = null;
  void focusAfterEdit(`[data-chunk-index="${String(index)}"]`);
}

function onChunkKey(event: KeyboardEvent, index: number): void {
  const entry = chunks.value[index];
  if (entry === undefined) return;
  const current = splitting.value;
  if (current === null || current.index !== index) {
    if (event.key === KeyboardKey.Enter && entry.words.length > 1) {
      event.preventDefault();
      splitting.value = { index, word: 1 };
    }
    return;
  }
  const last = entry.words.length - 1;
  const earlier = (): void => {
    splitting.value = { index, word: Math.max(1, current.word - 1) };
  };
  const later = (): void => {
    splitting.value = { index, word: Math.min(last, current.word + 1) };
  };
  const SPLIT_KEYS: Partial<Record<string, () => void>> = {
    [KeyboardKey.ArrowLeft]: earlier,
    [KeyboardKey.ArrowUp]: earlier,
    [KeyboardKey.ArrowRight]: later,
    [KeyboardKey.ArrowDown]: later,
    [KeyboardKey.Enter]: () => {
      splitAt(index, current.word);
    },
    [KeyboardKey.Escape]: () => {
      splitting.value = null;
    },
  };
  const action = SPLIT_KEYS[event.key];
  if (action !== undefined) {
    event.preventDefault();
    action();
  }
}

function isSplitCaret(index: number, word: number): boolean {
  return splitting.value?.index === index && splitting.value.word === word;
}

// Dragging a boundary: drop it on a word, which becomes the first word after the boundary.
const dragging = ref<number | null>(null);

function onHandleDown(event: PointerEvent, index: number): void {
  dragging.value = index;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onHandleUp(event: PointerEvent): void {
  const index = dragging.value;
  dragging.value = null;
  const entry = index === null ? undefined : chunks.value[index];
  if (entry === undefined || index === null) return;
  const word = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-word-offset]');
  const blockId = word?.dataset.blockId;
  const offset = Number(word?.dataset.wordOffset);
  if (blockId === undefined || !Number.isInteger(offset)) return;
  emit('move', entry.chunk.id, { blockId, offset });
  void focusAfterEdit(`[data-boundary-index="${String(index)}"]`);
}
</script>

<template>
  <ol
    ref="root"
    class="flex flex-col"
    :class="dragging === null ? '' : 'cursor-grabbing select-none'"
  >
    <li
      v-for="({ chunk, words }, index) in chunks"
      :key="chunk.id"
      class="flex flex-col"
    >
      <div
        v-if="index > 0"
        class="group flex items-center gap-2 py-1"
        data-boundary
      >
        <button
          type="button"
          class="flex min-h-target flex-1 cursor-grab touch-none items-center gap-2 rounded-md px-2 text-ink-subtle hover:text-accent focus-visible:text-accent"
          :aria-label="t('script.chunks.boundary_label', { before: index, after: index + 1 })"
          aria-describedby="chunk-editor-help"
          aria-keyshortcuts="ArrowUp ArrowDown Delete"
          :data-boundary-index="index"
          @keydown="onBoundaryKey($event, index)"
          @pointerdown="onHandleDown($event, index)"
          @pointerup="onHandleUp"
        >
          <UIcon
            name="i-lucide-grip-horizontal"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <span
            class="h-px flex-1 bg-current"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          class="inline-flex size-target items-center justify-center rounded-md text-ink-subtle hover:text-accent focus-visible:text-accent"
          :aria-label="t('script.chunks.merge', { before: index, after: index + 1 })"
          :data-merge-index="index"
          @click="merge(index)"
        >
          <UIcon
            name="i-lucide-unfold-vertical"
            class="size-4"
            aria-hidden="true"
          />
        </button>
      </div>
      <div
        class="flex flex-col gap-1 rounded-md border border-line bg-surface-1 p-3 focus-visible:border-accent"
        tabindex="0"
        role="group"
        :aria-label="t('script.chunks.chunk_label', { number: index + 1, total })"
        aria-describedby="chunk-editor-help"
        :data-chunk-index="index"
        :data-chunk-id="chunk.id"
        @keydown="onChunkKey($event, index)"
      >
        <div class="flex items-center gap-2 text-xs text-ink-subtle">
          <span class="font-semibold">{{ index + 1 }}</span>
          <span
            v-if="chunk.sceneCue !== null"
            class="text-warning"
          >{{ t('script.chunks.scene_cue', { cue: chunk.sceneCue.text }) }}</span>
        </div>
        <p
          class="text-lg leading-relaxed"
          data-chunk-text
        >
          <!-- v-text keeps the gaps verbatim: template whitespace would be condensed. -->
          <span
            v-for="(word, wordIndex) in words"
            :key="`${word.blockId}:${word.start}`"
          ><span v-text="word.gapBefore" /><span
            class="rounded-sm"
            :class="[
              wordIndex === 0 ? '' : 'cursor-col-resize hover:shadow-[-3px_0_0_var(--rc-accent)]',
              isSplitCaret(index, wordIndex) ? 'shadow-[-3px_0_0_var(--rc-accent)] bg-surface-2' : '',
            ]"
            :data-block-id="word.blockId"
            :data-word-offset="word.start"
            :data-split-caret="isSplitCaret(index, wordIndex) ? 'true' : undefined"
            @click="splitAt(index, wordIndex)"
            v-text="word.text"
          /></span>
        </p>
        <p
          v-if="splitting?.index === index"
          class="text-xs text-accent"
        >
          {{ t('script.chunks.split_mode') }}
        </p>
      </div>
    </li>
  </ol>
</template>
