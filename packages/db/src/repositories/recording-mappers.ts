import type {
  ChunkPlanResource,
  Export,
  Project,
  Script,
  ScriptBlock,
  ScriptChunk,
  ScriptSummary,
  Session,
  Take,
} from '@repo/contracts';
import type {
  ChunkPlanRow,
  ExportRow,
  ProjectRow,
  ScriptBlockRow,
  ScriptChunkRow,
  ScriptRow,
  SessionRow,
  TakeRow,
} from '../entities/recording.ts';

// Row → API resource. Internal fields (owner ids, media keys, source refs) never leave the server.

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toScriptBlock(row: ScriptBlockRow): ScriptBlock {
  return { id: row.id, order: row.order, type: row.type, text: row.text, source: row.source, metadata: row.metadata };
}

export function toScriptSummary(row: ScriptRow, blockCount: number): ScriptSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    sourceKind: row.sourceKind,
    blockCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toScript(row: ScriptRow, blocks: readonly ScriptBlockRow[]): Script {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    sourceKind: row.sourceKind,
    sourceText: row.sourceText,
    blocks: blocks.map(toScriptBlock),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toScriptChunk(row: ScriptChunkRow): ScriptChunk {
  return {
    id: row.id,
    order: row.order,
    ranges: row.ranges,
    text: row.text,
    spokenText: row.spokenText,
    sceneCue: row.sceneCue,
  };
}

export function toChunkPlan(plan: ChunkPlanRow, chunks: readonly ScriptChunkRow[]): ChunkPlanResource {
  return {
    id: plan.id,
    scriptId: plan.scriptId,
    version: plan.version,
    mode: plan.mode,
    chunks: chunks.map(toScriptChunk),
    createdAt: plan.createdAt.toISOString(),
  };
}

export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.projectId,
    chunkPlanId: row.chunkPlanId,
    deviceId: row.deviceId,
    state: row.state,
    currentChunkId: row.currentChunkId,
    seq: row.seq,
    settings: row.settings,
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function takeMediaUrl(id: string): string {
  return `/api/takes/${id}/media`;
}

export function toTake(row: TakeRow): Take {
  return {
    id: row.id,
    sessionId: row.sessionId,
    chunkPlanId: row.chunkPlanId,
    chunkId: row.chunkId,
    ordinal: row.ordinal,
    status: row.status,
    selected: row.selected,
    kind: row.kind,
    mimeType: row.mimeType,
    bytes: row.bytes,
    durationMs: row.durationMs,
    mediaUrl: row.mediaKey === null ? null : takeMediaUrl(row.id),
    timing: row.timing,
    transcript: row.transcript,
    match: row.match,
    deletedAt: iso(row.deletedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toExport(row: ExportRow): Export {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status,
    kind: row.kind,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
