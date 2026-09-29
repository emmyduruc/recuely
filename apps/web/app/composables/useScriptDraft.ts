// The script being imported (SPEC.md Task 12): paste → blocks (re-typed by the user) → chunk plan (edited by
// the user) → saved through the Task 4 API. All text comes from the paste; nothing here rewrites wording.
import {
  type BlockType,
  ChunkMode,
  type ChunkPlan,
  type ScriptBlock,
  SourceKind,
  type Project,
} from '@repo/contracts';
import {
  type BlockPosition,
  type BoundaryStep,
  checkCoverage,
  type EditResult,
  mergeWithNext,
  moveBoundary,
  nudgeBoundary,
  parseScript,
  reconcileBlockIds,
  retypeBlock,
  type ScriptEditError,
  segment,
  setSpokenColumn,
  splitChunk,
  tablesOf,
} from '@repo/script-model';
import { api } from '~/utils/api';
import { blockInputs, planInputs } from '~/utils/script-review';

const PARSE_DEBOUNCE_MS = 150;
const newId = (): string => crypto.randomUUID();

export function useScriptDraft() {
  const title = ref('');
  const source = ref('');
  const mode = ref<ChunkMode>(ChunkMode.Sentence);
  /** Blocks as parsed; ids carried over between parses so the user's re-typing survives edits elsewhere. */
  const parsed = shallowRef<ScriptBlock[]>([]);
  /** The user's re-typing, by block id. */
  const retyped = shallowRef<ReadonlyMap<string, BlockType>>(new Map());
  const plan = shallowRef<ChunkPlan>({ mode: mode.value, chunks: [] });
  const lastEditError = ref<ScriptEditError | null>(null);

  const blocks = computed<ScriptBlock[]>(() =>
    parsed.value.map((block) => {
      const type = retyped.value.get(block.id);
      return type === undefined ? block : { ...block, type };
    }),
  );
  const tables = computed(() => tablesOf(blocks.value));
  const coverageIssues = computed(() => checkCoverage(blocks.value, plan.value.chunks));

  let parseTimer: ReturnType<typeof setTimeout> | undefined;
  watch(source, (text) => {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(() => {
      parsed.value = reconcileBlockIds(parsed.value, parseScript(text, { newId }));
    }, PARSE_DEBOUNCE_MS);
  });

  // Text, block types or chunk size changed: segment again (boundary edits are discarded; the UI says so).
  watch([blocks, mode], () => {
    plan.value = segment(blocks.value, mode.value, { newId });
    lastEditError.value = null;
  });

  function applyBlocks(result: EditResult<ScriptBlock[]>): void {
    if (!result.ok) {
      lastEditError.value = result.error;
      return;
    }
    const next = new Map(retyped.value);
    for (const block of result.value) {
      const original = parsed.value.find((candidate) => candidate.id === block.id);
      if (original !== undefined && original.type !== block.type) next.set(block.id, block.type);
      else next.delete(block.id);
    }
    retyped.value = next;
  }

  function applyPlan(result: EditResult<ChunkPlan>): boolean {
    if (!result.ok) {
      lastEditError.value = result.error;
      return false;
    }
    plan.value = result.value;
    lastEditError.value = null;
    return true;
  }

  const edits = {
    retype: (blockId: string, type: BlockType) => {
      applyBlocks(retypeBlock(blocks.value, blockId, type));
    },
    setSpokenColumn: (tableIndex: number, column: number | null) => {
      applyBlocks(setSpokenColumn(blocks.value, tableIndex, column));
    },
    split: (chunkId: string, at: BlockPosition) => applyPlan(splitChunk(blocks.value, plan.value, chunkId, at, newId)),
    merge: (chunkId: string) => applyPlan(mergeWithNext(blocks.value, plan.value, chunkId, newId)),
    move: (chunkId: string, at: BlockPosition) => applyPlan(moveBoundary(blocks.value, plan.value, chunkId, at, newId)),
    nudge: (chunkId: string, step: BoundaryStep) => applyPlan(nudgeBoundary(blocks.value, plan.value, chunkId, step, newId)),
  };

  const canSave = computed(
    () => title.value.trim().length > 0 && plan.value.chunks.length > 0 && coverageIssues.value.length === 0,
  );

  /**
   * Saves project → script (types + ranges) → chunk plan (ranges). The server rebuilds all text and checks
   * coverage again. Its block ids differ from ours, so chunk ranges are mapped by block order.
   */
  async function save(): Promise<Project> {
    const ordered = [...blocks.value].sort((a, b) => a.order - b.order);
    const project = await api.createProject({ title: title.value.trim() });
    const script = await api.createScript(project.id, {
      sourceKind: SourceKind.Paste,
      sourceText: source.value,
      blocks: blockInputs(ordered),
    });
    await api.createChunkPlan(script.id, { mode: plan.value.mode, chunks: planInputs(ordered, script.blocks, plan.value.chunks) });
    return project;
  }

  return { title, source, mode, blocks, tables, plan, coverageIssues, lastEditError, edits, canSave, save };
}
