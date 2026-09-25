import { type ApiError, ApiErrorCode, ContractType, MediaType } from '@repo/contracts';
import { componentRef, contractExample } from './contract-schemas';
import { exampleConflictError, exampleNotFoundError, exampleValidationError } from './examples';
import { BODY_ERRORS, DB_ERRORS, error } from './paths';
import { ApiTag } from './tags';
import {
  JSON_MEDIA_TYPE,
  type OperationObject,
  type ParameterObject,
  type PathItemObject,
  type RequestBodyObject,
  type ResponseObject,
} from './types';

// Task 4 operations (SPEC.md §B5 route table). Schemas and examples come from the contract schemas.

const EXAMPLE_ID = '0192a1b2-c3d4-7e5f-8a6b-000000000001';

function json(description: string, type: ContractType): ResponseObject {
  return { description, content: { [JSON_MEDIA_TYPE]: { schema: componentRef(type), example: contractExample(type) } } };
}

function jsonList(description: string, type: ContractType): ResponseObject {
  return {
    description,
    content: { [JSON_MEDIA_TYPE]: { schema: { type: 'array', items: componentRef(type) }, example: [contractExample(type)] } },
  };
}

function body(description: string, type: ContractType): RequestBodyObject {
  return { required: true, description, content: { [JSON_MEDIA_TYPE]: { schema: componentRef(type), example: contractExample(type) } } };
}

function idParam(what: string): ParameterObject {
  return {
    name: 'id',
    in: 'path',
    required: true,
    description: `Id of the ${what}.`,
    schema: { type: 'string', format: 'uuid', description: 'UUID v7.' },
    example: EXAMPLE_ID,
  };
}

function flagParam(name: string, description: string, required = false): ParameterObject {
  return { name, in: 'query', required, description, schema: { type: 'boolean', description: 'true or false.' }, example: true };
}

const apiError = (statusCode: number, code: ApiErrorCode, message: string): ApiError => ({ statusCode, code, message });

const notFound = (what: string): ResponseObject =>
  error(`No ${what} with this id belongs to the current user.`, { ...exampleNotFoundError, message: `No ${what} with this id.` });

const coverageError = error(
  'The chunks would not preserve the spoken text (SPEC.md §B5 rules 2–4), or a chunk id was reused for other text.',
  { ...exampleValidationError, code: ApiErrorCode.CoverageViolation, message: 'The chunks must cover every word of the spoken text exactly once, in order.', details: [{ field: 'chunks', issue: 'uncovered' }] },
);

const MEDIA_SCHEMA_DESCRIPTION = `Raw media bytes in the take's container type (${Object.values(MediaType).join(', ')}).`;

const operations: Record<string, OperationObject> = {
  listProjects: {
    tags: [ApiTag.Projects],
    operationId: 'listProjects',
    summary: 'List projects',
    description: 'Active projects, newest first. `archived=true` lists archived ones instead. Read-only.',
    parameters: [flagParam('archived', 'List archived projects instead of active ones.')],
    responses: { 200: jsonList('The projects.', ContractType.Project), ...DB_ERRORS },
  },
  createProject: {
    tags: [ApiTag.Projects],
    operationId: 'createProject',
    summary: 'Create a project',
    description: 'Creates an empty project owned by the current user.',
    requestBody: body('The title.', ContractType.CreateProjectRequest),
    responses: { 201: json('The new project.', ContractType.Project), ...BODY_ERRORS, ...DB_ERRORS },
  },
  getProject: {
    tags: [ApiTag.Projects],
    operationId: 'getProject',
    summary: 'Get a project',
    description: 'Returns one project, archived or not. Read-only.',
    parameters: [idParam('project')],
    responses: { 200: json('The project.', ContractType.Project), 404: notFound('project'), ...DB_ERRORS },
  },
  updateProject: {
    tags: [ApiTag.Projects],
    operationId: 'updateProject',
    summary: 'Rename, archive or restore a project',
    description: 'Changes only the fields sent. `archived: false` restores an archived project. Idempotent.',
    parameters: [idParam('project')],
    requestBody: body('Fields to change.', ContractType.UpdateProjectRequest),
    responses: { 200: json('The updated project.', ContractType.Project), 404: notFound('project'), ...BODY_ERRORS, ...DB_ERRORS },
  },
  archiveProject: {
    tags: [ApiTag.Projects],
    operationId: 'archiveProject',
    summary: 'Archive a project',
    description:
      'Archives the project (sets `archivedAt`); nothing is deleted, and scripts, sessions and takes stay intact. ' +
      'Idempotent. Restore with PATCH `{ "archived": false }`.',
    parameters: [idParam('project')],
    responses: { 200: json('The archived project.', ContractType.Project), 404: notFound('project'), ...DB_ERRORS },
  },
  createScript: {
    tags: [ApiTag.Scripts],
    operationId: 'createScript',
    summary: 'Save a new script version',
    description:
      'Saves an immutable script version (version = previous + 1). Without `blocks` the server parses the text; ' +
      'with `blocks`, each block is a range of `sourceText` and its text is derived by the server. Blocks ' +
      'unchanged since the previous version keep their ids.',
    parameters: [idParam('project')],
    requestBody: body('The original text, and optionally the reviewed blocks.', ContractType.CreateScriptRequest),
    responses: { 201: json('The saved version with its blocks.', ContractType.Script), 404: notFound('project'), ...BODY_ERRORS, ...DB_ERRORS },
  },
  listScripts: {
    tags: [ApiTag.Scripts],
    operationId: 'listScripts',
    summary: 'List script versions of a project',
    description: 'All versions, oldest first, without their blocks. Read-only.',
    parameters: [idParam('project')],
    responses: { 200: jsonList('The versions.', ContractType.ScriptSummary), 404: notFound('project'), ...DB_ERRORS },
  },
  getScript: {
    tags: [ApiTag.Scripts],
    operationId: 'getScript',
    summary: 'Get a script version with its blocks',
    description: 'Returns the original text and the blocks in order. Read-only.',
    parameters: [idParam('script')],
    responses: { 200: json('The script.', ContractType.Script), 404: notFound('script'), ...DB_ERRORS },
  },
  createChunkPlan: {
    tags: [ApiTag.ChunkPlans],
    operationId: 'createChunkPlan',
    summary: 'Save a new chunk plan version',
    description:
      'Plans are immutable; every edit is a new version. Without `chunks` the server segments the script in ' +
      '`mode`. The server always rebuilds chunk text from the ranges and checks that every word of the spoken ' +
      'text is covered exactly once. Chunks identical to an earlier plan keep their ids, so recorded takes stay ' +
      'linked; reusing an id for different ranges is refused.',
    parameters: [idParam('script')],
    requestBody: body('Mode, and optionally the chunk ranges.', ContractType.CreateChunkPlanRequest),
    responses: {
      201: json('The saved plan.', ContractType.ChunkPlan),
      404: notFound('script'),
      ...BODY_ERRORS,
      422: coverageError,
      ...DB_ERRORS,
    },
  },
  getChunkPlan: {
    tags: [ApiTag.ChunkPlans],
    operationId: 'getChunkPlan',
    summary: 'Get a chunk plan with its chunks',
    description: 'Returns one immutable plan version. Read-only.',
    parameters: [idParam('chunk plan')],
    responses: { 200: json('The plan.', ContractType.ChunkPlan), 404: notFound('chunk plan'), ...DB_ERRORS },
  },
  createSession: {
    tags: [ApiTag.Sessions],
    operationId: 'createSession',
    summary: 'Start a recording session',
    description: 'Creates a session in state `idle` for a chunk plan (and optionally a calibrated device).',
    requestBody: body('The plan to read.', ContractType.CreateSessionRequest),
    responses: { 201: json('The new session.', ContractType.Session), 404: notFound('chunk plan'), ...BODY_ERRORS, ...DB_ERRORS },
  },
  getSession: {
    tags: [ApiTag.Sessions],
    operationId: 'getSession',
    summary: 'Get a session snapshot',
    description: 'Returns the last autosaved snapshot (for resuming after a reload or crash). Read-only.',
    parameters: [idParam('session')],
    responses: { 200: json('The session.', ContractType.Session), 404: notFound('session'), ...DB_ERRORS },
  },
  updateSession: {
    tags: [ApiTag.Sessions],
    operationId: 'updateSession',
    summary: 'Autosave a session snapshot',
    description:
      'Saves the engine snapshot. Applied only if `seq` is greater than the stored one, so a late save never ' +
      'overwrites a newer snapshot (SPEC.md §A6.7). Reaching `completed` stamps `completedAt`.',
    parameters: [idParam('session')],
    requestBody: body('The snapshot fields.', ContractType.UpdateSessionRequest),
    responses: {
      200: json('The saved snapshot.', ContractType.Session),
      404: notFound('session'),
      409: error('A newer snapshot (higher or equal seq) is already saved.', apiError(409, ApiErrorCode.StaleUpdate, 'A newer snapshot is already saved (seq).')),
      ...BODY_ERRORS,
      ...DB_ERRORS,
    },
  },
  createTake: {
    tags: [ApiTag.Takes],
    operationId: 'createTake',
    summary: 'Create a take before uploading its media',
    description:
      "Step 1 of an upload: creates the take row (status `recording`, ordinal = next for this chunk) against " +
      "the session's current plan, so a crash during upload can't lose the take. Then PUT the media.",
    parameters: [idParam('session')],
    requestBody: body('Chunk, kind and MIME type.', ContractType.CreateTakeRequest),
    responses: { 201: json('The new take.', ContractType.Take), 404: notFound('session'), ...BODY_ERRORS, ...DB_ERRORS },
  },
  listTakes: {
    tags: [ApiTag.Takes],
    operationId: 'listTakes',
    summary: 'List the takes of a session',
    description: 'Takes in recording order. Soft-deleted takes are hidden unless `includeDeleted=true`. Read-only.',
    parameters: [idParam('session'), flagParam('includeDeleted', 'Also list soft-deleted takes.')],
    responses: { 200: jsonList('The takes.', ContractType.Take), 404: notFound('session'), ...DB_ERRORS },
  },
  updateTake: {
    tags: [ApiTag.Takes],
    operationId: 'updateTake',
    summary: 'Select or mark a take',
    description:
      'Selecting a take unselects the other takes of its chunk (at most one is selected). Other takes are never ' +
      'removed. A deleted take, or one without media, cannot be selected.',
    parameters: [idParam('take')],
    requestBody: body('Fields to change.', ContractType.UpdateTakeRequest),
    responses: {
      200: json('The updated take.', ContractType.Take),
      404: notFound('take'),
      409: error('The take is deleted or has no media yet.', { ...exampleConflictError, message: 'A deleted take cannot be selected; restore it first.' }),
      ...BODY_ERRORS,
      ...DB_ERRORS,
    },
  },
  deleteTake: {
    tags: [ApiTag.Takes],
    operationId: 'deleteTake',
    summary: 'Soft-delete a take (needs confirm=true)',
    description:
      'Takes are never hard-deleted: this sets `deletedAt`, unselects the take and hides it from default lists. ' +
      'The row and media stay and POST /restore undoes it. Requires `confirm=true`. Idempotent.',
    parameters: [idParam('take'), flagParam('confirm', 'Must be true: confirms the deletion.', true)],
    responses: {
      200: json('The soft-deleted take.', ContractType.Take),
      404: notFound('take'),
      422: error('`confirm=true` is missing.', apiError(422, ApiErrorCode.ConfirmationRequired, 'Deleting a take needs confirm=true.')),
      ...DB_ERRORS,
    },
  },
  restoreTake: {
    tags: [ApiTag.Takes],
    operationId: 'restoreTake',
    summary: 'Restore a soft-deleted take',
    description: 'Clears `deletedAt`. The take stays unselected. Idempotent.',
    parameters: [idParam('take')],
    responses: { 200: json('The restored take.', ContractType.Take), 404: notFound('take'), ...DB_ERRORS },
  },
  uploadTakeMedia: {
    tags: [ApiTag.Takes],
    operationId: 'uploadTakeMedia',
    summary: "Upload a take's media (streamed, write-once)",
    description:
      "Step 2 of an upload: send the raw bytes with the take's Content-Type. The body streams to disk and is " +
      'published only when complete. Media is write-once: a second upload is 409. Limits: MAX_UPLOAD_BYTES (413) ' +
      'and free disk space (507).',
    parameters: [idParam('take')],
    requestBody: {
      required: true,
      description: 'The recorded media.',
      content: Object.fromEntries(
        Object.values(MediaType).map((type) => [type, { schema: { type: 'string', contentMediaType: type, description: MEDIA_SCHEMA_DESCRIPTION } }]),
      ),
    },
    responses: {
      200: json('The take, now with media.', ContractType.Take),
      404: notFound('take'),
      409: error('The take already has media, or is deleted.', { ...exampleConflictError, message: 'This take already has media; takes are never overwritten.' }),
      413: error('The upload exceeds MAX_UPLOAD_BYTES.', apiError(413, ApiErrorCode.PayloadTooLarge, 'The upload is larger than MAX_UPLOAD_BYTES.')),
      415: error("Content-Type does not match the take's MIME type.", apiError(415, ApiErrorCode.UnsupportedMediaType, 'Send the body with Content-Type video/webm.')),
      507: error('Not enough free disk space.', apiError(507, ApiErrorCode.InsufficientStorage, 'Not enough free disk space for this take.')),
      ...DB_ERRORS,
    },
  },
  getTakeMedia: {
    tags: [ApiTag.Takes],
    operationId: 'getTakeMedia',
    summary: "Download a take's media",
    description:
      'Streams the media. A single `Range: bytes=…` request gets 206 with `Content-Range`, so players can seek. ' +
      'Soft-deleted takes stay downloadable. Read-only.',
    parameters: [
      idParam('take'),
      {
        name: 'Range',
        in: 'header',
        required: false,
        description: 'Optional single byte range, e.g. `bytes=0-1023`.',
        schema: { type: 'string', description: 'RFC 9110 byte range.' },
        example: 'bytes=0-1023',
      },
    ],
    responses: {
      200: { description: 'The whole file.', content: { [MediaType.VideoWebm]: { schema: { type: 'string', contentMediaType: MediaType.VideoWebm, description: MEDIA_SCHEMA_DESCRIPTION } } } },
      206: { description: 'The requested range.', content: { [MediaType.VideoWebm]: { schema: { type: 'string', contentMediaType: MediaType.VideoWebm, description: MEDIA_SCHEMA_DESCRIPTION } } } },
      404: notFound('take or media'),
      416: error('The range is outside the file.', apiError(416, ApiErrorCode.RangeNotSatisfiable, 'The requested range is outside the file.')),
      ...DB_ERRORS,
    },
  },
  createExport: {
    tags: [ApiTag.Exports],
    operationId: 'createExport',
    summary: 'Request an export of a session',
    description: 'Records an export request with status `pending`. Producing the files arrives in Task 17.',
    parameters: [idParam('session')],
    requestBody: body('What to export.', ContractType.CreateExportRequest),
    responses: { 201: json('The export request.', ContractType.Export), 404: notFound('session'), ...BODY_ERRORS, ...DB_ERRORS },
  },
  getExport: {
    tags: [ApiTag.Exports],
    operationId: 'getExport',
    summary: 'Get an export',
    description: 'Returns the export status. Read-only.',
    parameters: [idParam('export')],
    responses: { 200: json('The export.', ContractType.Export), 404: notFound('export'), ...DB_ERRORS },
  },
};

function op(name: string): OperationObject {
  const operation = operations[name];
  if (operation === undefined) {
    throw new Error(`Unknown operation ${name}`);
  }
  return operation;
}

export const RECORDING_PATHS: Readonly<Record<string, PathItemObject>> = {
  '/api/projects': { get: op('listProjects'), post: op('createProject') },
  '/api/projects/{id}': { get: op('getProject'), patch: op('updateProject'), delete: op('archiveProject') },
  '/api/projects/{id}/scripts': { post: op('createScript'), get: op('listScripts') },
  '/api/scripts/{id}': { get: op('getScript') },
  '/api/scripts/{id}/chunk-plans': { post: op('createChunkPlan') },
  '/api/chunk-plans/{id}': { get: op('getChunkPlan') },
  '/api/sessions': { post: op('createSession') },
  '/api/sessions/{id}': { get: op('getSession'), patch: op('updateSession') },
  '/api/sessions/{id}/takes': { post: op('createTake'), get: op('listTakes') },
  '/api/sessions/{id}/exports': { post: op('createExport') },
  '/api/takes/{id}': { patch: op('updateTake'), delete: op('deleteTake') },
  '/api/takes/{id}/restore': { post: op('restoreTake') },
  '/api/takes/{id}/media': { put: op('uploadTakeMedia'), get: op('getTakeMedia') },
  '/api/exports/{id}': { get: op('getExport') },
};
