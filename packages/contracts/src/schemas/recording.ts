import {
  type ChunkInput,
  type ChunkPlanResource,
  type CreateChunkPlanRequest,
  type CreateExportRequest,
  type CreateProjectRequest,
  type CreateScriptRequest,
  type CreateSessionRequest,
  type CreateTakeRequest,
  type Export,
  ExportKind,
  ExportStatus,
  MediaType,
  type Project,
  RecordingLimits,
  type Script,
  type ScriptBlockInput,
  type ScriptSummary,
  type Session,
  SessionState,
  SourceKind,
  type Take,
  TakeKind,
  TakeStatus,
  type UpdateProjectRequest,
  type UpdateSessionRequest,
  type UpdateTakeRequest,
} from '../recording.ts';
import {
  type BlockMetadata,
  type BlockSource,
  BlockType,
  ChunkMode,
  type ChunkRange,
  type ScriptBlock,
  type ScriptChunk,
  type TableCellSource,
} from '../script.ts';
import {
  enumOf,
  freeObject,
  nonNegativeInt,
  nullableRef,
  ref,
  text,
  timestamp,
  uuid,
} from './helpers.ts';
import { type JsonSchema, nullable, objectSchema } from './json-schema.ts';

// Task 4 contracts: projects, scripts, chunk plans, sessions, takes, exports (SPEC.md §B4/§B5).

const MEDIA_TYPE_PATTERN = `^(${Object.values(MediaType).join('|').replaceAll('/', '\\/')})(;.*)?$`;

const ID = {
  project: '0192a1b2-c3d4-7e5f-8a6b-000000000001',
  script: '0192a1b2-c3d4-7e5f-8a6b-000000000002',
  blockA: '0192a1b2-c3d4-7e5f-8a6b-00000000000a',
  blockB: '0192a1b2-c3d4-7e5f-8a6b-00000000000b',
  plan: '0192a1b2-c3d4-7e5f-8a6b-000000000003',
  chunk: '0192a1b2-c3d4-7e5f-8a6b-00000000000c',
  session: '0192a1b2-c3d4-7e5f-8a6b-000000000004',
  take: '0192a1b2-c3d4-7e5f-8a6b-000000000005',
  export: '0192a1b2-c3d4-7e5f-8a6b-000000000006',
} as const;
const AT = '2026-09-24T09:30:00.000Z';
const SOURCE = '# Intro\n\nWelcome back, everyone.';

export const exampleProject: Project = { id: ID.project, title: 'Product launch', archivedAt: null, createdAt: AT, updatedAt: AT };
const exampleBlocks: ScriptBlock[] = [
  { id: ID.blockA, order: 0, type: BlockType.Heading, text: 'Intro', source: { start: 2, end: 7 }, metadata: { marker: '# ' } },
  { id: ID.blockB, order: 1, type: BlockType.Spoken, text: 'Welcome back, everyone.', source: { start: 9, end: 32 }, metadata: {} },
];
export const exampleScript: Script = {
  id: ID.script,
  projectId: ID.project,
  version: 1,
  sourceKind: SourceKind.Paste,
  sourceText: SOURCE,
  blocks: exampleBlocks,
  createdAt: AT,
};
const exampleChunk: ScriptChunk = {
  id: ID.chunk,
  order: 0,
  ranges: [{ blockId: ID.blockB, start: 0, end: 23 }],
  text: 'Welcome back, everyone.',
  spokenText: 'Welcome back, everyone.',
  sceneCue: null,
};
export const exampleChunkPlan: ChunkPlanResource = {
  id: ID.plan,
  scriptId: ID.script,
  version: 1,
  mode: ChunkMode.Sentence,
  chunks: [exampleChunk],
  createdAt: AT,
};
export const exampleSession: Session = {
  id: ID.session,
  projectId: ID.project,
  chunkPlanId: ID.plan,
  deviceId: null,
  state: SessionState.Ready,
  currentChunkId: ID.chunk,
  seq: 12,
  settings: { mode: 'auto' },
  completedAt: null,
  createdAt: AT,
  updatedAt: AT,
};
export const exampleTake: Take = {
  id: ID.take,
  sessionId: ID.session,
  chunkPlanId: ID.plan,
  chunkId: ID.chunk,
  ordinal: 1,
  status: TakeStatus.Complete,
  selected: true,
  kind: TakeKind.Video,
  mimeType: 'video/webm;codecs=vp9,opus',
  bytes: 1_048_576,
  durationMs: 3200,
  mediaUrl: `/api/takes/${ID.take}/media`,
  timing: null,
  transcript: null,
  match: null,
  deletedAt: null,
  createdAt: AT,
  updatedAt: AT,
};
export const exampleExport: Export = {
  id: ID.export,
  sessionId: ID.session,
  status: ExportStatus.Pending,
  kind: ExportKind.PerTake,
  error: null,
  createdAt: AT,
  updatedAt: AT,
};

const tableCell = objectSchema<TableCellSource>()({
  type: 'object',
  description: 'Table provenance of a block.',
  properties: {
    index: nonNegativeInt('Table number in the source.'),
    row: nonNegativeInt('Row (0 is the header row when there is one).'),
    column: nonNegativeInt('Column.'),
    header: { type: ['string', 'null'], description: "The column's header text, if any." },
  },
  required: ['index', 'row', 'column', 'header'],
  additionalProperties: false,
});

const blockMetadata = objectSchema<BlockMetadata>()({
  type: 'object',
  description: 'Parser metadata.',
  properties: {
    marker: { type: 'string', description: 'Markup removed from around the text.' },
    tableHeader: { type: 'boolean', description: 'The block is a table header cell.' },
  },
  required: [],
  additionalProperties: false,
});

const blockSource = objectSchema<BlockSource>()({
  type: 'object',
  description: 'Range of the block in the original source (UTF-16).',
  properties: {
    start: nonNegativeInt('First UTF-16 unit.'),
    end: nonNegativeInt('UTF-16 unit after the block.'),
    table: { ...tableCell, description: 'Table provenance.' },
  },
  required: ['start', 'end'],
  additionalProperties: false,
});

const chunkRange = objectSchema<ChunkRange>()({
  type: 'object',
  description: 'A range of one spoken block (UTF-16).',
  properties: {
    blockId: uuid('Spoken block id.'),
    start: nonNegativeInt('First UTF-16 unit.'),
    end: nonNegativeInt('UTF-16 unit after the range.'),
  },
  required: ['blockId', 'start', 'end'],
  additionalProperties: false,
});

export const RECORDING_SCHEMAS = {
  Project: objectSchema<Project>()({
    type: 'object',
    description: 'A project owns scripts and recording sessions.',
    properties: {
      id: uuid('UUID v7.'),
      title: { type: 'string', description: 'Project title.' },
      archivedAt: { ...nullable({ type: 'string', format: 'date-time' }), description: 'When archived, or null.' },
      createdAt: timestamp('When created.'),
      updatedAt: timestamp('When last changed.'),
    },
    required: ['id', 'title', 'archivedAt', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    examples: [exampleProject],
  }),
  CreateProjectRequest: objectSchema<CreateProjectRequest>()({
    type: 'object',
    description: 'POST /api/projects body.',
    properties: { title: text(RecordingLimits.titleMax, 'Project title.') },
    required: ['title'],
    additionalProperties: false,
    examples: [{ title: 'Product launch' }],
  }),
  UpdateProjectRequest: objectSchema<UpdateProjectRequest>()({
    type: 'object',
    description: 'PATCH /api/projects/:id body. At least one field.',
    properties: {
      title: text(RecordingLimits.titleMax, 'New title.'),
      archived: { type: 'boolean', description: '`false` restores an archived project; `true` archives it.' },
    },
    required: [],
    minProperties: 1,
    additionalProperties: false,
    examples: [{ archived: false }],
  }),
  ScriptBlock: objectSchema<ScriptBlock>()({
    type: 'object',
    description: 'One block of a script. `text` is exactly `sourceText.slice(source.start, source.end)`.',
    properties: {
      id: uuid('Block id; stable across script versions while its type and text are unchanged.'),
      order: nonNegativeInt('Position in the script.'),
      type: enumOf(BlockType, 'Only `spoken` blocks are read and chunked.'),
      text: { type: 'string', description: 'The block text, verbatim.' },
      source: { ...blockSource, description: 'Source range and table provenance.' },
      metadata: { ...blockMetadata, description: 'Parser metadata.' },
    },
    required: ['id', 'order', 'type', 'text', 'source', 'metadata'],
    additionalProperties: false,
    examples: [exampleBlocks[1]],
  }),
  ScriptChunk: objectSchema<ScriptChunk>()({
    type: 'object',
    description: 'One chunk: ranges over spoken blocks; text is rebuilt by the server from the ranges.',
    properties: {
      id: uuid('Chunk id; kept by later plan versions only while the ranges are identical.'),
      order: nonNegativeInt('Position in the plan.'),
      ranges: { type: 'array', minItems: 1, items: chunkRange, description: 'One range per spoken block.' },
      text: { type: 'string', description: 'The covered text, verbatim (ranges joined by a space).' },
      spokenText: { type: 'string', description: 'What is read: whitespace collapsed, emphasis markers removed.' },
      sceneCue: {
        anyOf: [
          {
            type: 'object',
            required: ['blockId', 'text'],
            additionalProperties: false,
            properties: { blockId: uuid('Scene cue block.'), text: { type: 'string', description: 'Cue text.' } },
          },
          { type: 'null' },
        ],
        description: 'The scene cue this chunk follows, or null.',
      },
    },
    required: ['id', 'order', 'ranges', 'text', 'spokenText', 'sceneCue'],
    additionalProperties: false,
    examples: [exampleChunk],
  }),
  ScriptSummary: objectSchema<ScriptSummary>()({
    type: 'object',
    description: 'One script version, without its blocks.',
    properties: {
      id: uuid('Script id.'),
      projectId: uuid('Owning project.'),
      version: { type: 'integer', minimum: 1, description: 'Version within the project (1, 2, …).' },
      sourceKind: enumOf(SourceKind, 'Where the script came from.'),
      blockCount: nonNegativeInt('Number of blocks.'),
      createdAt: timestamp('When this version was saved.'),
    },
    required: ['id', 'projectId', 'version', 'sourceKind', 'blockCount', 'createdAt'],
    additionalProperties: false,
    examples: [{ id: ID.script, projectId: ID.project, version: 1, sourceKind: SourceKind.Paste, blockCount: 2, createdAt: AT }],
  }),
  Script: objectSchema<Script>()({
    type: 'object',
    description: 'An immutable script version with its original text and blocks.',
    properties: {
      id: uuid('Script id.'),
      projectId: uuid('Owning project.'),
      version: { type: 'integer', minimum: 1, description: 'Version within the project.' },
      sourceKind: enumOf(SourceKind, 'Where the script came from.'),
      sourceText: { type: 'string', description: 'The original pasted text, unchanged.' },
      blocks: { type: 'array', items: ref('ScriptBlock'), description: 'Blocks in order.' },
      createdAt: timestamp('When this version was saved.'),
    },
    required: ['id', 'projectId', 'version', 'sourceKind', 'sourceText', 'blocks', 'createdAt'],
    additionalProperties: false,
    examples: [exampleScript],
  }),
  CreateScriptRequest: objectSchema<CreateScriptRequest>()({
    type: 'object',
    description:
      'POST /api/projects/:id/scripts body. Without `blocks` the server parses `sourceText`; with `blocks` ' +
      '(from the review UI) each block must be a non-empty, in-order, non-overlapping range of `sourceText`.',
    properties: {
      sourceKind: enumOf(SourceKind, 'Where the script came from.'),
      sourceText: { type: 'string', minLength: 1, maxLength: RecordingLimits.sourceTextMax, pattern: '\\S', description: 'The original text.' },
      blocks: {
        type: 'array',
        maxItems: RecordingLimits.blocksMax,
        description: 'Block types and ranges; the server derives each text.',
        items: objectSchema<ScriptBlockInput>()({
          type: 'object',
          description: 'A block: type and source range.',
          properties: {
            type: enumOf(BlockType, 'Block type.'),
            start: nonNegativeInt('First UTF-16 unit in sourceText.'),
            end: nonNegativeInt('UTF-16 unit after the block.'),
            table: { ...tableCell, description: 'Table provenance.' },
            metadata: { ...blockMetadata, description: 'Parser metadata.' },
          },
          required: ['type', 'start', 'end'],
          additionalProperties: false,
        }),
      },
    },
    required: ['sourceKind', 'sourceText'],
    additionalProperties: false,
    examples: [{ sourceKind: SourceKind.Paste, sourceText: SOURCE }],
  }),
  ChunkPlan: objectSchema<ChunkPlanResource>()({
    type: 'object',
    description: 'An immutable chunk plan version over a script.',
    properties: {
      id: uuid('Plan id.'),
      scriptId: uuid('Script the plan chunks.'),
      version: { type: 'integer', minimum: 1, description: 'Version within the script.' },
      mode: enumOf(ChunkMode, 'Segmentation mode the plan started from.'),
      chunks: { type: 'array', items: ref('ScriptChunk'), description: 'Chunks in reading order.' },
      createdAt: timestamp('When saved.'),
    },
    required: ['id', 'scriptId', 'version', 'mode', 'chunks', 'createdAt'],
    additionalProperties: false,
    examples: [exampleChunkPlan],
  }),
  CreateChunkPlanRequest: objectSchema<CreateChunkPlanRequest>()({
    type: 'object',
    description:
      'POST /api/scripts/:id/chunk-plans body. Without `chunks` the server segments the script in `mode`. ' +
      'With `chunks`, the ranges must cover the spoken text exactly once; an id from an earlier plan may be ' +
      'reused only with identical ranges.',
    properties: {
      mode: enumOf(ChunkMode, 'Segmentation mode.'),
      chunks: {
        type: 'array',
        minItems: 1,
        maxItems: RecordingLimits.chunksMax,
        description: 'Chunks as ranges.',
        items: objectSchema<ChunkInput>()({
          type: 'object',
          description: 'A chunk: optional id and its ranges.',
          properties: {
            id: uuid('Reuse an id from an earlier plan (identical ranges only), or omit for a new id.'),
            ranges: { type: 'array', minItems: 1, items: chunkRange, description: 'Ranges in order.' },
          },
          required: ['ranges'],
          additionalProperties: false,
        }),
      },
    },
    required: ['mode'],
    additionalProperties: false,
    examples: [{ mode: ChunkMode.Sentence }],
  }),
  Session: objectSchema<Session>()({
    type: 'object',
    description: 'A recording session snapshot (SPEC.md §B6). Not an event log.',
    properties: {
      id: uuid('Session id.'),
      projectId: uuid('Project.'),
      chunkPlanId: uuid('Plan the session currently reads.'),
      deviceId: { ...nullable({ type: 'string', format: 'uuid' }), description: 'Calibrated device, or null.' },
      state: enumOf(SessionState, 'Engine state at the last autosave.'),
      currentChunkId: { ...nullable({ type: 'string', format: 'uuid' }), description: 'Current chunk, or null.' },
      seq: nonNegativeInt('Engine sequence number of the last autosave.'),
      settings: freeObject('Session settings (mode, arrangement, …).'),
      completedAt: { ...nullable({ type: 'string', format: 'date-time' }), description: 'When completed, or null.' },
      createdAt: timestamp('When started.'),
      updatedAt: timestamp('Last autosave.'),
    },
    required: ['id', 'projectId', 'chunkPlanId', 'deviceId', 'state', 'currentChunkId', 'seq', 'settings', 'completedAt', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    examples: [exampleSession],
  }),
  CreateSessionRequest: objectSchema<CreateSessionRequest>()({
    type: 'object',
    description: 'POST /api/sessions body.',
    properties: {
      chunkPlanId: uuid('Plan to read.'),
      deviceId: uuid('Calibrated device of the current user.'),
    },
    required: ['chunkPlanId'],
    additionalProperties: false,
    examples: [{ chunkPlanId: ID.plan }],
  }),
  UpdateSessionRequest: objectSchema<UpdateSessionRequest>()({
    type: 'object',
    description: 'PATCH /api/sessions/:id body (autosave). `seq` must be greater than the stored one.',
    properties: {
      seq: nonNegativeInt('Engine sequence number; stale saves are rejected with 409.'),
      state: enumOf(SessionState, 'Engine state.'),
      currentChunkId: { ...nullable({ type: 'string', format: 'uuid' }), description: 'Current chunk (must be in the plan).' },
      chunkPlanId: uuid('Switch to another plan version of the same project.'),
      settings: freeObject('Session settings (replaces the stored object).'),
    },
    required: ['seq'],
    additionalProperties: false,
    examples: [{ seq: 13, state: SessionState.Paused, currentChunkId: ID.chunk }],
  }),
  Take: objectSchema<Take>()({
    type: 'object',
    description: 'A recorded take. Takes are never hard-deleted; `deletedAt` marks a soft delete.',
    properties: {
      id: uuid('Take id.'),
      sessionId: uuid('Session.'),
      chunkPlanId: uuid('Plan version the take was recorded against.'),
      chunkId: uuid('Chunk the take belongs to.'),
      ordinal: { type: 'integer', minimum: 1, description: '1, 2, … per session and chunk.' },
      status: enumOf(TakeStatus, 'Recording state.'),
      selected: { type: 'boolean', description: 'The chosen take for this chunk (at most one).' },
      kind: enumOf(TakeKind, 'Audio or video.'),
      mimeType: { type: 'string', pattern: MEDIA_TYPE_PATTERN, description: 'Container MIME type, optionally with codecs.' },
      bytes: nonNegativeInt('Uploaded size in bytes (0 until uploaded).'),
      durationMs: { ...nullable({ type: 'integer', minimum: 0 }), description: 'Duration in ms, or null.' },
      mediaUrl: { type: ['string', 'null'], description: 'Download URL, or null until the media is uploaded.' },
      timing: { type: ['object', 'null'], description: 'Capture timing metadata.' },
      transcript: { type: ['object', 'null'], description: 'STT transcript.' },
      match: nullableRef('MatchResult', 'Transcript match result.'),
      deletedAt: { ...nullable({ type: 'string', format: 'date-time' }), description: 'Soft-delete time, or null.' },
      createdAt: timestamp('When created.'),
      updatedAt: timestamp('When last changed.'),
    },
    required: ['id', 'sessionId', 'chunkPlanId', 'chunkId', 'ordinal', 'status', 'selected', 'kind', 'mimeType', 'bytes', 'durationMs', 'mediaUrl', 'timing', 'transcript', 'match', 'deletedAt', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    examples: [exampleTake],
  }),
  CreateTakeRequest: objectSchema<CreateTakeRequest>()({
    type: 'object',
    description: 'POST /api/sessions/:id/takes body. Creates the take row before the media upload.',
    properties: {
      chunkId: uuid("Chunk in the session's current plan."),
      kind: enumOf(TakeKind, 'Audio or video; must match the MIME type.'),
      mimeType: { type: 'string', pattern: MEDIA_TYPE_PATTERN, description: 'Container MIME type of the upload.' },
      durationMs: nonNegativeInt('Duration in ms, if known.'),
      timing: freeObject('Capture timing metadata.'),
    },
    required: ['chunkId', 'kind', 'mimeType'],
    additionalProperties: false,
    examples: [{ chunkId: ID.chunk, kind: TakeKind.Video, mimeType: 'video/webm;codecs=vp9,opus' }],
  }),
  UpdateTakeRequest: objectSchema<UpdateTakeRequest>()({
    type: 'object',
    description: 'PATCH /api/takes/:id body. Selecting a take unselects the other takes of its chunk.',
    properties: {
      selected: { type: 'boolean', description: 'Choose (or unchoose) this take.' },
      status: { type: 'string', enum: [TakeStatus.Complete, TakeStatus.Interrupted, TakeStatus.Unusable], description: 'Mark the take.' },
      durationMs: nonNegativeInt('Duration in ms.'),
      timing: freeObject('Capture timing metadata.'),
      transcript: freeObject('STT transcript.'),
      match: { ...ref('MatchResult'), description: 'Transcript match result.' },
    },
    required: [],
    minProperties: 1,
    additionalProperties: false,
    examples: [{ selected: true }],
  }),
  Export: objectSchema<Export>()({
    type: 'object',
    description: 'An export of a session (files are produced in Task 17).',
    properties: {
      id: uuid('Export id.'),
      sessionId: uuid('Session.'),
      status: enumOf(ExportStatus, 'Progress.'),
      kind: enumOf(ExportKind, 'Per-take files or one stitched file.'),
      error: { type: ['string', 'null'], description: 'Why it failed, or null.' },
      createdAt: timestamp('When requested.'),
      updatedAt: timestamp('When last changed.'),
    },
    required: ['id', 'sessionId', 'status', 'kind', 'error', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    examples: [exampleExport],
  }),
  CreateExportRequest: objectSchema<CreateExportRequest>()({
    type: 'object',
    description: 'POST /api/sessions/:id/exports body.',
    properties: { kind: enumOf(ExportKind, 'Per-take files or one stitched file.') },
    required: ['kind'],
    additionalProperties: false,
    examples: [{ kind: ExportKind.PerTake }],
  }),
} as const satisfies Record<string, JsonSchema>;

export { MEDIA_TYPE_PATTERN };
