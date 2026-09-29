<script setup lang="ts">
// Script import & review (SPEC.md Task 12): the creator checks exactly what will be read, and in which pieces.
import { BlockType, ChunkMode, StatusTone } from '@repo/contracts';
import { apiErrorMessage } from '~/utils/api';
import type { MessageKey } from '~/utils/message-key';
import {
  BLOCK_TYPE_CLASS,
  BLOCK_TYPE_LABEL,
  CHUNK_MODE_HINT,
  CHUNK_MODE_LABEL,
  EDIT_ERROR_MESSAGE,
} from '~/utils/script-review';

const t = useT();
useHead({ title: () => t('script.title') });

const draft = useScriptDraft();
const { title, source, mode, blocks, tables, plan, coverageIssues, lastEditError, edits, canSave } = draft;

const BLOCK_TYPES = Object.values(BlockType);
const CHUNK_MODES = Object.values(ChunkMode);

const orderedBlocks = computed(() => [...blocks.value].sort((a, b) => a.order - b.order));
const wordCount = computed(() => plan.value.chunks.reduce((sum, chunk) => sum + chunk.spokenText.split(' ').filter(Boolean).length, 0));

const saving = ref(false);
const saveError = ref<MessageKey | null>(null);

function onRetype(blockId: string, event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  const type = BLOCK_TYPES.find((candidate) => candidate === value);
  if (type !== undefined) edits.retype(blockId, type);
}

const NO_COLUMN = '';

function onSpokenColumn(tableIndex: number, event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  edits.setSpokenColumn(tableIndex, value.length === 0 ? null : Number(value));
}

async function onSave(): Promise<void> {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    await draft.save();
    await navigateTo('/');
  } catch (error) {
    saveError.value = apiErrorMessage(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold">
        {{ t('script.title') }}
      </h1>
      <p class="max-w-3xl text-ink-muted">
        {{ t('script.intro') }}
      </p>
    </header>

    <div class="grid gap-8 lg:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-8">
        <section
          class="flex flex-col gap-4"
          aria-labelledby="script-source"
        >
          <h2
            id="script-source"
            class="text-lg font-semibold"
          >
            {{ t('script.source_title') }}
          </h2>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ t('script.project_title_label') }}</span>
            <input
              v-model="title"
              type="text"
              class="min-h-target rounded-md border border-line-strong bg-surface-1 px-3"
              :placeholder="t('script.project_title_placeholder')"
              data-project-title
            >
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ t('script.source_label') }}</span>
            <textarea
              v-model="source"
              rows="12"
              class="rounded-md border border-line-strong bg-surface-1 p-3 font-mono text-sm"
              :placeholder="t('script.source_placeholder')"
              aria-describedby="script-source-hint"
              data-script-source
            />
            <span
              id="script-source-hint"
              class="text-sm text-ink-muted"
            >{{ t('script.source_hint') }}</span>
          </label>
        </section>

        <section
          class="flex flex-col gap-4"
          aria-labelledby="script-blocks"
        >
          <h2
            id="script-blocks"
            class="text-lg font-semibold"
          >
            {{ t('script.blocks.title') }}
          </h2>
          <p class="text-sm text-ink-muted">
            {{ t('script.blocks.hint') }}
          </p>
          <div
            v-for="table in tables"
            :key="table.index"
            class="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-1 p-3"
            :data-table-index="table.index"
          >
            <label class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">{{ t('script.tables.column_label', { number: table.index + 1 }) }}</span>
              <select
                class="min-h-target rounded-md border border-line-strong bg-surface-2 px-2"
                :value="table.spokenColumn === null ? NO_COLUMN : String(table.spokenColumn)"
                data-spoken-column
                @change="onSpokenColumn(table.index, $event)"
              >
                <option :value="NO_COLUMN">
                  {{ t('script.tables.none') }}
                </option>
                <option
                  v-for="column in table.columns"
                  :key="column.column"
                  :value="String(column.column)"
                >
                  {{ column.header ?? t('script.tables.column', { number: column.column + 1 }) }}
                </option>
              </select>
            </label>
          </div>
          <p
            v-if="orderedBlocks.length === 0"
            class="rounded-md border border-dashed border-line-strong p-4 text-sm text-ink-muted"
          >
            {{ t('script.blocks.empty') }}
          </p>
          <ol
            v-else
            class="flex flex-col gap-2"
          >
            <li
              v-for="(block, index) in orderedBlocks"
              :key="block.id"
              class="flex flex-col gap-2 rounded-md border border-line bg-surface-1 p-3 sm:flex-row sm:items-start"
              :data-block-type="block.type"
            >
              <select
                class="min-h-target shrink-0 self-start rounded-full border bg-surface-2 px-3 text-sm font-medium"
                :class="BLOCK_TYPE_CLASS[block.type]"
                :value="block.type"
                :aria-label="t('script.blocks.type_label', { number: index + 1 })"
                data-block-type-select
                @change="onRetype(block.id, $event)"
              >
                <option
                  v-for="type in BLOCK_TYPES"
                  :key="type"
                  :value="type"
                >
                  {{ t(BLOCK_TYPE_LABEL[type]) }}
                </option>
              </select>
              <p
                class="min-w-0 pt-2 [overflow-wrap:anywhere]"
                :class="block.type === BlockType.Spoken ? 'text-ink' : 'text-ink-muted'"
                data-block-text
              >
                {{ block.text }}
              </p>
            </li>
          </ol>
        </section>
      </div>

      <section
        class="flex min-w-0 flex-col gap-4"
        aria-labelledby="script-chunks"
      >
        <h2
          id="script-chunks"
          class="text-lg font-semibold"
        >
          {{ t('script.chunks.title') }}
        </h2>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium">
            {{ t('script.mode.label') }}
          </legend>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label
              v-for="option in CHUNK_MODES"
              :key="option"
              class="flex min-h-target cursor-pointer flex-col justify-center rounded-md border px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-surface-2 has-focus-visible:outline-2 has-focus-visible:outline-focus"
              :class="mode === option ? 'border-accent' : 'border-line-strong'"
            >
              <input
                v-model="mode"
                type="radio"
                name="chunk-mode"
                class="sr-only"
                :value="option"
                :data-chunk-mode="option"
              >
              <span class="font-medium">{{ t(CHUNK_MODE_LABEL[option]) }}</span>
              <span class="text-xs text-ink-muted">{{ t(CHUNK_MODE_HINT[option]) }}</span>
            </label>
          </div>
        </fieldset>
        <p class="text-xs text-ink-subtle">
          {{ t('script.resegment_note') }}
        </p>

        <div class="flex flex-wrap items-center gap-3">
          <StatusPill
            v-if="coverageIssues.length === 0"
            :tone="StatusTone.Success"
            icon="i-lucide-shield-check"
            :label="t('script.coverage.ok')"
            data-coverage-ok
          />
          <StatusPill
            v-else
            :tone="StatusTone.Error"
            icon="i-lucide-shield-alert"
            :label="t('script.coverage.problems', { count: coverageIssues.length })"
            data-coverage-problems
          />
          <span
            class="text-sm text-ink-muted"
            data-chunk-count
          >{{ t('script.chunks.count', { count: plan.chunks.length, words: wordCount }) }}</span>
        </div>

        <p
          id="chunk-editor-help"
          class="text-sm text-ink-muted"
        >
          {{ t('script.chunks.hint') }}
        </p>
        <p
          class="min-h-5 text-sm text-warning"
          aria-live="polite"
          data-edit-error
        >
          <template v-if="lastEditError !== null">
            {{ t(EDIT_ERROR_MESSAGE[lastEditError]) }}
          </template>
        </p>

        <p
          v-if="plan.chunks.length === 0"
          class="rounded-md border border-dashed border-line-strong p-4 text-sm text-ink-muted"
        >
          {{ t('script.chunks.empty') }}
        </p>
        <ScriptChunkEditor
          v-else
          :blocks="blocks"
          :plan="plan"
          @split="edits.split"
          @merge="edits.merge"
          @move="edits.move"
          @nudge="edits.nudge"
        />

        <div class="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-canvas py-4">
          <p
            v-if="saveError !== null"
            class="text-sm text-error"
            role="alert"
          >
            {{ t(saveError) }}
          </p>
          <button
            type="button"
            class="inline-flex min-h-target items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canSave || saving"
            data-save-script
            @click="onSave"
          >
            <UIcon
              :name="saving ? 'i-lucide-loader' : 'i-lucide-save'"
              class="size-4"
              :class="saving ? 'motion-safe:animate-spin' : ''"
              aria-hidden="true"
            />
            {{ saving ? t('script.saving') : t('script.save') }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
