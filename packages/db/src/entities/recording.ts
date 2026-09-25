import type {
  BlockMetadata,
  BlockSource,
  BlockType,
  ChunkMode,
  ChunkRange,
  ExportKind,
  ExportStatus,
  MatchResult,
  SceneCueRef,
  SessionState,
  SourceKind,
  TakeKind,
  TakeStatus,
} from '@repo/contracts';
import { EntitySchema } from 'typeorm';

// Task 4 entities (SPEC.md §B4). Blocks and chunks have composite primary keys because their ids are logical
// ids that recur across script/plan versions (Task 3).

const timestamps = {
  createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
} as const;

export interface ProjectRow {
  id: string;
  ownerId: string;
  title: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ProjectEntity = new EntitySchema<ProjectRow>({
  name: 'Project',
  tableName: 'projects',
  columns: {
    id: { type: 'uuid', primary: true },
    ownerId: { name: 'owner_id', type: 'uuid' },
    title: { type: 'varchar' },
    archivedAt: { name: 'archived_at', type: 'timestamptz', nullable: true },
    ...timestamps,
  },
});

export interface ScriptRow {
  id: string;
  projectId: string;
  version: number;
  sourceKind: SourceKind;
  sourceRef: string | null;
  sourceText: string;
  originalAssetKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ScriptEntity = new EntitySchema<ScriptRow>({
  name: 'Script',
  tableName: 'scripts',
  columns: {
    id: { type: 'uuid', primary: true },
    projectId: { name: 'project_id', type: 'uuid' },
    version: { type: 'integer' },
    sourceKind: { name: 'source_kind', type: 'varchar' },
    sourceRef: { name: 'source_ref', type: 'text', nullable: true },
    sourceText: { name: 'source_text', type: 'text' },
    originalAssetKey: { name: 'original_asset_key', type: 'text', nullable: true },
    ...timestamps,
  },
});

export interface ScriptBlockRow {
  scriptId: string;
  id: string;
  order: number;
  type: BlockType;
  text: string;
  source: BlockSource;
  metadata: BlockMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export const ScriptBlockEntity = new EntitySchema<ScriptBlockRow>({
  name: 'ScriptBlock',
  tableName: 'script_blocks',
  columns: {
    scriptId: { name: 'script_id', type: 'uuid', primary: true },
    id: { type: 'uuid', primary: true },
    order: { type: 'integer' },
    type: { type: 'varchar' },
    text: { type: 'text' },
    source: { type: 'jsonb' },
    metadata: { type: 'jsonb' },
    ...timestamps,
  },
});

export interface ChunkPlanRow {
  id: string;
  scriptId: string;
  version: number;
  mode: ChunkMode;
  createdAt: Date;
  updatedAt: Date;
}

export const ChunkPlanEntity = new EntitySchema<ChunkPlanRow>({
  name: 'ChunkPlan',
  tableName: 'chunk_plans',
  columns: {
    id: { type: 'uuid', primary: true },
    scriptId: { name: 'script_id', type: 'uuid' },
    version: { type: 'integer' },
    mode: { type: 'varchar' },
    ...timestamps,
  },
});

export interface ScriptChunkRow {
  chunkPlanId: string;
  id: string;
  order: number;
  ranges: ChunkRange[];
  text: string;
  spokenText: string;
  sceneCue: SceneCueRef | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ScriptChunkEntity = new EntitySchema<ScriptChunkRow>({
  name: 'ScriptChunk',
  tableName: 'script_chunks',
  columns: {
    chunkPlanId: { name: 'chunk_plan_id', type: 'uuid', primary: true },
    id: { type: 'uuid', primary: true },
    order: { type: 'integer' },
    ranges: { type: 'jsonb' },
    text: { type: 'text' },
    spokenText: { name: 'spoken_text', type: 'text' },
    sceneCue: { name: 'scene_cue', type: 'jsonb', nullable: true },
    ...timestamps,
  },
});

export interface SessionRow {
  id: string;
  projectId: string;
  userId: string;
  deviceId: string | null;
  chunkPlanId: string;
  state: SessionState;
  currentChunkId: string | null;
  seq: number;
  settings: Record<string, unknown>;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SessionEntity = new EntitySchema<SessionRow>({
  name: 'Session',
  tableName: 'sessions',
  columns: {
    id: { type: 'uuid', primary: true },
    projectId: { name: 'project_id', type: 'uuid' },
    userId: { name: 'user_id', type: 'uuid' },
    deviceId: { name: 'device_id', type: 'uuid', nullable: true },
    chunkPlanId: { name: 'chunk_plan_id', type: 'uuid' },
    state: { type: 'varchar' },
    currentChunkId: { name: 'current_chunk_id', type: 'uuid', nullable: true },
    seq: { type: 'bigint' },
    settings: { type: 'jsonb' },
    completedAt: { name: 'completed_at', type: 'timestamptz', nullable: true },
    ...timestamps,
  },
});

export interface TakeRow {
  id: string;
  sessionId: string;
  chunkPlanId: string;
  chunkId: string;
  ordinal: number;
  status: TakeStatus;
  selected: boolean;
  mediaKey: string | null;
  mimeType: string;
  kind: TakeKind;
  bytes: number;
  durationMs: number | null;
  timing: Record<string, unknown> | null;
  transcript: Record<string, unknown> | null;
  match: MatchResult | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const TakeEntity = new EntitySchema<TakeRow>({
  name: 'Take',
  tableName: 'takes',
  columns: {
    id: { type: 'uuid', primary: true },
    sessionId: { name: 'session_id', type: 'uuid' },
    chunkPlanId: { name: 'chunk_plan_id', type: 'uuid' },
    chunkId: { name: 'chunk_id', type: 'uuid' },
    ordinal: { type: 'integer' },
    status: { type: 'varchar' },
    selected: { type: 'boolean' },
    mediaKey: { name: 'media_key', type: 'text', nullable: true },
    mimeType: { name: 'mime_type', type: 'varchar' },
    kind: { type: 'varchar' },
    bytes: { type: 'bigint' },
    durationMs: { name: 'duration_ms', type: 'integer', nullable: true },
    timing: { type: 'jsonb', nullable: true },
    transcript: { type: 'jsonb', nullable: true },
    match: { type: 'jsonb', nullable: true },
    deletedAt: { name: 'deleted_at', type: 'timestamptz', nullable: true },
    ...timestamps,
  },
});

export interface ExportRow {
  id: string;
  sessionId: string;
  status: ExportStatus;
  kind: ExportKind;
  mediaKey: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ExportEntity = new EntitySchema<ExportRow>({
  name: 'Export',
  tableName: 'exports',
  columns: {
    id: { type: 'uuid', primary: true },
    sessionId: { name: 'session_id', type: 'uuid' },
    status: { type: 'varchar' },
    kind: { type: 'varchar' },
    mediaKey: { name: 'media_key', type: 'text', nullable: true },
    error: { type: 'text', nullable: true },
    ...timestamps,
  },
});
