import type { MatchResult } from './payloads.ts';
import type { BlockMetadata, ChunkMode, ChunkPlan, ChunkRange, ScriptBlock, TableCellSource, BlockType } from './script.ts';

// Projects, scripts, chunk plans, sessions, takes and exports (SPEC.md §B4, Task 4). Timestamps are ISO 8601.

export const SourceKind = {
  Paste: 'paste',
} as const;
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];

/** Session states (SPEC.md §B6). */
export const SessionState = {
  Idle: 'idle',
  Preparing: 'preparing',
  Ready: 'ready',
  AssistantSpeaking: 'assistant_speaking',
  Settle: 'settle',
  WaitingForSpeech: 'waiting_for_speech',
  CreatorSpeaking: 'creator_speaking',
  Evaluating: 'evaluating',
  ReviewOrAdvance: 'review_or_advance',
  Paused: 'paused',
  Recovering: 'recovering',
  Error: 'error',
  Completed: 'completed',
} as const;
export type SessionState = (typeof SessionState)[keyof typeof SessionState];

export const TakeStatus = {
  Recording: 'recording',
  Complete: 'complete',
  Interrupted: 'interrupted',
  Unusable: 'unusable',
} as const;
export type TakeStatus = (typeof TakeStatus)[keyof typeof TakeStatus];

export const TakeKind = {
  Audio: 'audio',
  Video: 'video',
} as const;
export type TakeKind = (typeof TakeKind)[keyof typeof TakeKind];

/** Container formats accepted for takes (codecs may follow as `;codecs=…`). Revisited after Task 9. */
export const MediaType = {
  VideoWebm: 'video/webm',
  VideoMp4: 'video/mp4',
  AudioWebm: 'audio/webm',
  AudioMp4: 'audio/mp4',
  AudioOgg: 'audio/ogg',
  AudioWav: 'audio/wav',
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const ExportStatus = {
  Pending: 'pending',
  Running: 'running',
  Done: 'done',
  Failed: 'failed',
} as const;
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

export const ExportKind = {
  PerTake: 'per_take',
  Stitched: 'stitched',
} as const;
export type ExportKind = (typeof ExportKind)[keyof typeof ExportKind];

export const RecordingLimits = {
  titleMax: 200,
  sourceTextMax: 200_000,
  blocksMax: 5_000,
  chunksMax: 5_000,
} as const;

export interface Project {
  id: string;
  title: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  title: string;
}

export interface UpdateProjectRequest {
  title?: string;
  /** `false` restores an archived project; `true` archives it (same as DELETE). */
  archived?: boolean;
}

/** One block as sent by the client: its type and where it sits in `sourceText`. The server derives the text. */
export interface ScriptBlockInput {
  type: BlockType;
  start: number;
  end: number;
  table?: TableCellSource;
  metadata?: BlockMetadata;
}

export interface CreateScriptRequest {
  sourceKind: SourceKind;
  sourceText: string;
  /** Omit to let the server parse `sourceText`; send to keep the user's re-typing from the review UI. */
  blocks?: ScriptBlockInput[];
}

export interface ScriptSummary {
  id: string;
  projectId: string;
  version: number;
  sourceKind: SourceKind;
  blockCount: number;
  createdAt: string;
}

export interface Script extends Omit<ScriptSummary, 'blockCount'> {
  sourceText: string;
  blocks: ScriptBlock[];
}

/** One chunk as sent by the client: an optional id (reuse only with identical ranges) and its ranges. */
export interface ChunkInput {
  id?: string;
  ranges: ChunkRange[];
}

export interface CreateChunkPlanRequest {
  mode: ChunkMode;
  /** Omit to let the server segment the script in `mode`. */
  chunks?: ChunkInput[];
}

export interface ChunkPlanResource extends ChunkPlan {
  id: string;
  scriptId: string;
  version: number;
  createdAt: string;
}

export interface Session {
  id: string;
  projectId: string;
  chunkPlanId: string;
  deviceId: string | null;
  state: SessionState;
  currentChunkId: string | null;
  seq: number;
  settings: Record<string, unknown>;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionRequest {
  chunkPlanId: string;
  deviceId?: string;
}

/** Autosave of the engine snapshot. `seq` must be greater than the stored one (stale saves are rejected). */
export interface UpdateSessionRequest {
  seq: number;
  state?: SessionState;
  currentChunkId?: string | null;
  chunkPlanId?: string;
  settings?: Record<string, unknown>;
}

export interface Take {
  id: string;
  sessionId: string;
  chunkPlanId: string;
  chunkId: string;
  ordinal: number;
  status: TakeStatus;
  selected: boolean;
  kind: TakeKind;
  mimeType: string;
  bytes: number;
  durationMs: number | null;
  /** Where to download the media, or null until it has been uploaded. */
  mediaUrl: string | null;
  timing: Record<string, unknown> | null;
  transcript: Record<string, unknown> | null;
  match: MatchResult | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTakeRequest {
  chunkId: string;
  kind: TakeKind;
  mimeType: string;
  durationMs?: number;
  timing?: Record<string, unknown>;
}

export interface UpdateTakeRequest {
  selected?: boolean;
  status?: TakeStatus;
  durationMs?: number;
  timing?: Record<string, unknown>;
  transcript?: Record<string, unknown>;
  match?: MatchResult;
}

export interface Export {
  id: string;
  sessionId: string;
  status: ExportStatus;
  kind: ExportKind;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExportRequest {
  kind: ExportKind;
}
