import { readdirSync } from 'node:fs';
import {
  ApiErrorCode,
  BlockType,
  type ChunkPlanResource,
  ChunkMode,
  ContractType,
  type Project,
  type Script,
  type Session,
  SessionState,
  type Take,
  TakeKind,
} from '@repo/contracts';
import { validateContract } from '@repo/contracts/validation';
import { describe, expect, inject, it } from 'vitest';
import { TEST_MAX_UPLOAD_BYTES } from './global-setup';
import { api, useSeededDatabase } from './helpers';

useSeededDatabase();

const SOURCE = [
  '# Launch',
  '',
  'Note: smile',
  '',
  'Welcome back, everyone. Today we build a shelf.',
  '',
  'Thanks for watching.',
].join('\n');
const MISSING = '0192a1b2-c3d4-7e5f-8a6b-0000000000ff';

/** Asserts status, validates the body against its contract, and returns it typed. */
async function expectResource<K extends ContractType>(
  type: K,
  response: Promise<{ status: number; body: unknown }>,
  status = 200,
) {
  const { status: actual, body } = await response;
  expect(actual, JSON.stringify(body)).toBe(status);
  const result = validateContract(type, body);
  if (!result.ok) {
    throw new Error(`${type} response failed its contract: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
}

async function expectError(response: Promise<{ status: number; body: unknown }>, status: number, code: ApiErrorCode) {
  const { status: actual, body } = await response;
  expect(actual, JSON.stringify(body)).toBe(status);
  expect(body).toMatchObject({ statusCode: status, code });
}

function media(method: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${inject('baseUrl')}${path}`, { method, ...init });
}

async function world() {
  const project = await expectResource(ContractType.Project, api('POST', '/api/projects', { title: '  Launch  ' }), 201);
  const script = await expectResource(
    ContractType.Script,
    api('POST', `/api/projects/${project.id}/scripts`, { sourceKind: 'paste', sourceText: SOURCE }),
    201,
  );
  const plan = await expectResource(ContractType.ChunkPlan, api('POST', `/api/scripts/${script.id}/chunk-plans`, { mode: ChunkMode.Sentence }), 201);
  const session = await expectResource(ContractType.Session, api('POST', '/api/sessions', { chunkPlanId: plan.id }), 201);
  return { project, script, plan, session };
}

function firstChunk(plan: ChunkPlanResource): string {
  const chunk = plan.chunks[0];
  if (chunk === undefined) {
    throw new Error('plan has no chunks');
  }
  return chunk.id;
}

async function takeWithMedia(session: Session, chunkId: string, bytes: Uint8Array<ArrayBuffer>): Promise<Take> {
  const take = await expectResource(
    ContractType.Take,
    api('POST', `/api/sessions/${session.id}/takes`, { chunkId, kind: TakeKind.Video, mimeType: 'video/webm;codecs=vp9' }),
    201,
  );
  const upload = await media('PUT', `/api/takes/${take.id}/media`, { headers: { 'content-type': 'video/webm' }, body: bytes });
  expect(upload.status).toBe(200);
  return expectResource(ContractType.Take, Promise.resolve({ status: 200, body: (await upload.json()) as unknown }));
}

describe('Task 4 API: projects', () => {
  it('T4: create (title trimmed), list, archive via DELETE, list archived, restore via PATCH', async () => {
    const { project } = await world();
    expect(project.title).toBe('Launch');
    const listed = await api('GET', '/api/projects');
    expect((listed.body as Project[]).map((p) => p.id)).toEqual([project.id]);
    const archived = await expectResource(ContractType.Project, api('DELETE', `/api/projects/${project.id}`));
    expect(archived.archivedAt).not.toBeNull();
    expect((await api('GET', '/api/projects')).body).toEqual([]);
    expect(((await api('GET', '/api/projects?archived=true')).body as Project[]).map((p) => p.id)).toEqual([project.id]);
    const restored = await expectResource(ContractType.Project, api('PATCH', `/api/projects/${project.id}`, { archived: false }));
    expect(restored.archivedAt).toBeNull();
    expect((await expectResource(ContractType.Project, api('GET', `/api/projects/${project.id}`))).id).toBe(project.id);
    await expectError(api('POST', '/api/projects', { title: '  ' }), 422, ApiErrorCode.ValidationFailed);
    await expectError(api('GET', `/api/projects/${MISSING}`), 404, ApiErrorCode.NotFound);
    await expectError(api('GET', '/api/projects/not-a-uuid'), 404, ApiErrorCode.NotFound);
  });
});

describe('Task 4 API: scripts and chunk plans', () => {
  it('T4: the server parses scripts; versions count up; unchanged blocks keep their ids; reviewed types are kept', async () => {
    const { project, script } = await world();
    expect(script.blocks.map((b) => [b.type, b.text])).toEqual([
      [BlockType.Heading, 'Launch'],
      [BlockType.Note, 'smile'],
      [BlockType.Spoken, 'Welcome back, everyone. Today we build a shelf.'],
      [BlockType.Spoken, 'Thanks for watching.'],
    ]);
    // The review UI re-types the note as spoken and sends ranges; the server derives text from sourceText.
    const reviewed = script.blocks.map((b) => ({
      type: b.type === BlockType.Note ? BlockType.Spoken : b.type,
      start: b.source.start,
      end: b.source.end,
      metadata: b.metadata,
    }));
    const v2 = await expectResource(
      ContractType.Script,
      api('POST', `/api/projects/${project.id}/scripts`, { sourceKind: 'paste', sourceText: SOURCE, blocks: reviewed }),
      201,
    );
    expect(v2.version).toBe(2);
    expect(v2.blocks[1]).toMatchObject({ type: BlockType.Spoken, text: 'smile' });
    expect([v2.blocks[0]?.id, v2.blocks[2]?.id, v2.blocks[3]?.id]).toEqual([script.blocks[0]?.id, script.blocks[2]?.id, script.blocks[3]?.id]);
    expect(v2.blocks[1]?.id).not.toBe(script.blocks[1]?.id);

    const versions = await api('GET', `/api/projects/${project.id}/scripts`);
    expect((versions.body as { version: number; blockCount: number }[]).map((v) => [v.version, v.blockCount])).toEqual([
      [1, 4],
      [2, 4],
    ]);
    const fetched = await expectResource(ContractType.Script, api('GET', `/api/scripts/${script.id}`));
    expect(fetched.sourceText).toBe(SOURCE);

    await expectError(
      api('POST', `/api/projects/${project.id}/scripts`, { sourceKind: 'paste', sourceText: SOURCE, blocks: [{ type: 'spoken', start: 5, end: 2 }] }),
      422,
      ApiErrorCode.ValidationFailed,
    );
  });

  it('T4: a plan that breaks coverage is rejected; ids are reused only for identical ranges; client text is ignored', async () => {
    const { script, plan } = await world();
    expect(plan.chunks.map((c) => c.text)).toEqual(['Welcome back, everyone.', 'Today we build a shelf.', 'Thanks for watching.']);
    const inputs = plan.chunks.map(({ id, ranges }) => ({ id, ranges }));

    await expectError(api('POST', `/api/scripts/${script.id}/chunk-plans`, { mode: ChunkMode.Smart, chunks: inputs.slice(1) }), 422, ApiErrorCode.CoverageViolation);

    const [a, b, c] = inputs;
    if (a === undefined || b === undefined || c === undefined) {
      throw new Error('setup');
    }
    const firstRange = a.ranges[0];
    const secondRange = b.ranges[0];
    if (firstRange === undefined || secondRange === undefined) {
      throw new Error('setup');
    }
    // Reusing chunk a's id for the merged a+b text is refused.
    const merged = { id: a.id, ranges: [{ ...firstRange, end: secondRange.end }] };
    await expectError(api('POST', `/api/scripts/${script.id}/chunk-plans`, { mode: ChunkMode.Smart, chunks: [merged, c] }), 422, ApiErrorCode.ValidationFailed);

    // Clients can't send chunk text at all: the server derives it from the ranges.
    await expectError(
      api('POST', `/api/scripts/${script.id}/chunk-plans`, {
        mode: ChunkMode.Smart,
        chunks: [{ ranges: merged.ranges, text: 'paraphrased' }, { ranges: c.ranges }],
      }),
      422,
      ApiErrorCode.ValidationFailed,
    );
    // Without an id the merged chunk gets a new one; the untouched chunk keeps its id.
    const v2 = await expectResource(
      ContractType.ChunkPlan,
      api('POST', `/api/scripts/${script.id}/chunk-plans`, { mode: ChunkMode.Smart, chunks: [{ ranges: merged.ranges }, { ranges: c.ranges }] }),
      201,
    );
    expect(v2.version).toBe(2);
    expect(v2.chunks.map((chunk) => chunk.text)).toEqual(['Welcome back, everyone. Today we build a shelf.', 'Thanks for watching.']);
    expect(v2.chunks[1]?.id).toBe(c.id);
    expect(v2.chunks[0]?.id).not.toBe(a.id);

    const again = await expectResource(ContractType.ChunkPlan, api('GET', `/api/chunk-plans/${plan.id}`));
    expect(again).toEqual(plan);
  });
});

describe('Task 4 API: sessions', () => {
  it('T4: autosave needs an increasing seq; the current chunk must be in the plan', async () => {
    const { session, plan } = await world();
    const chunkId = firstChunk(plan);
    const saved = await expectResource(
      ContractType.Session,
      api('PATCH', `/api/sessions/${session.id}`, { seq: 1, state: SessionState.Ready, currentChunkId: chunkId, settings: { mode: 'auto' } }),
    );
    expect(saved).toMatchObject({ seq: 1, state: SessionState.Ready, currentChunkId: chunkId, settings: { mode: 'auto' } });
    await expectError(api('PATCH', `/api/sessions/${session.id}`, { seq: 1, state: SessionState.Paused }), 409, ApiErrorCode.StaleUpdate);
    await expectError(api('PATCH', `/api/sessions/${session.id}`, { seq: 2, currentChunkId: MISSING }), 422, ApiErrorCode.ValidationFailed);
    const reloaded = await expectResource(ContractType.Session, api('GET', `/api/sessions/${session.id}`));
    expect(reloaded.state).toBe(SessionState.Ready);
  });
});

describe('Task 4 API: takes and media', () => {
  it('T4: 3 takes for one chunk, select one: exactly one selected and all 3 recoverable', async () => {
    const { session, plan } = await world();
    const chunkId = firstChunk(plan);
    const takes = [
      await takeWithMedia(session, chunkId, new Uint8Array([1, 2, 3])),
      await takeWithMedia(session, chunkId, new Uint8Array([4, 5, 6, 7])),
      await takeWithMedia(session, chunkId, new Uint8Array([8, 9])),
    ];
    expect(takes.map((t) => t.ordinal)).toEqual([1, 2, 3]);
    expect(takes.map((t) => t.bytes)).toEqual([3, 4, 2]);

    for (const take of [takes[1], takes[2]]) {
      await expectResource(ContractType.Take, api('PATCH', `/api/takes/${take?.id ?? ''}`, { selected: true }));
    }
    const listed = (await api('GET', `/api/sessions/${session.id}/takes`)).body as Take[];
    expect(listed.filter((t) => t.selected).map((t) => t.id)).toEqual([takes[2]?.id]);
    expect(listed).toHaveLength(3);
    for (const take of listed) {
      const download = await media('GET', take.mediaUrl ?? '');
      expect(download.status).toBe(200);
    }
  });

  it('T4: media is write-once, typed, size-limited, and downloadable by range', async () => {
    const { session, plan, script } = await world();
    const chunkId = firstChunk(plan);
    const take = await takeWithMedia(session, chunkId, new TextEncoder().encode('0123456789'));

    const second = await media('PUT', `/api/takes/${take.id}/media`, { headers: { 'content-type': 'video/webm' }, body: new Uint8Array([1]) });
    expect(second.status).toBe(409);

    const whole = await media('GET', `/api/takes/${take.id}/media`);
    expect([whole.status, whole.headers.get('accept-ranges'), await whole.text()]).toEqual([200, 'bytes', '0123456789']);
    const part = await media('GET', `/api/takes/${take.id}/media`, { headers: { range: 'bytes=2-5' } });
    expect([part.status, part.headers.get('content-range'), await part.text()]).toEqual([206, 'bytes 2-5/10', '2345']);
    const outside = await media('GET', `/api/takes/${take.id}/media`, { headers: { range: 'bytes=50-' } });
    expect(outside.status).toBe(416);
    expect(await outside.json()).toMatchObject({ code: ApiErrorCode.RangeNotSatisfiable });

    const fresh = await expectResource(ContractType.Take, api('POST', `/api/sessions/${session.id}/takes`, { chunkId, kind: TakeKind.Video, mimeType: 'video/webm' }), 201);
    const wrongType = await media('PUT', `/api/takes/${fresh.id}/media`, { headers: { 'content-type': 'audio/wav' }, body: new Uint8Array([1]) });
    expect(wrongType.status).toBe(415);
    const tooBig = await media('PUT', `/api/takes/${fresh.id}/media`, {
      headers: { 'content-type': 'video/webm' },
      body: new Uint8Array(TEST_MAX_UPLOAD_BYTES + 1),
    });
    expect(tooBig.status).toBe(413);
    // A streamed body without Content-Length is cut off at the limit too, and leaves no file behind.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(TEST_MAX_UPLOAD_BYTES));
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
    });
    const streamed = await media('PUT', `/api/takes/${fresh.id}/media`, {
      headers: { 'content-type': 'video/webm' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(streamed.status).toBe(413);
    const sessionDir = `${inject('storageDir')}/takes/${session.id}`;
    expect(readdirSync(sessionDir).filter((name) => name.startsWith(fresh.id))).toEqual([]);
    await expectError(api('PATCH', `/api/takes/${fresh.id}`, { selected: true }), 409, ApiErrorCode.Conflict);

    // Unknown chunk and mismatched kind are refused before anything is stored.
    await expectError(api('POST', `/api/sessions/${session.id}/takes`, { chunkId: MISSING, kind: TakeKind.Video, mimeType: 'video/webm' }), 422, ApiErrorCode.ValidationFailed);
    await expectError(api('POST', `/api/sessions/${session.id}/takes`, { chunkId, kind: TakeKind.Audio, mimeType: 'video/webm' }), 422, ApiErrorCode.ValidationFailed);

    // A new plan never re-links the take.
    await expectResource(ContractType.ChunkPlan, api('POST', `/api/scripts/${script.id}/chunk-plans`, { mode: ChunkMode.Paragraph }), 201);
    const listed = (await api('GET', `/api/sessions/${session.id}/takes`)).body as Take[];
    expect(listed.find((t) => t.id === take.id)).toMatchObject({ chunkPlanId: plan.id, chunkId });
  });

  it('T4: delete needs confirm=true, is soft, and can be restored; a deleted take cannot be selected', async () => {
    const { session, plan } = await world();
    const take = await takeWithMedia(session, firstChunk(plan), new Uint8Array([1]));
    await expectResource(ContractType.Take, api('PATCH', `/api/takes/${take.id}`, { selected: true }));

    await expectError(api('DELETE', `/api/takes/${take.id}`), 422, ApiErrorCode.ConfirmationRequired);
    const deleted = await expectResource(ContractType.Take, api('DELETE', `/api/takes/${take.id}?confirm=true`));
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.selected).toBe(false);
    expect((await api('GET', `/api/sessions/${session.id}/takes`)).body).toEqual([]);
    expect((await api('GET', `/api/sessions/${session.id}/takes?includeDeleted=true`)).body).toHaveLength(1);
    expect((await media('GET', `/api/takes/${take.id}/media`)).status).toBe(200);
    await expectError(api('PATCH', `/api/takes/${take.id}`, { selected: true }), 409, ApiErrorCode.Conflict);

    const restored = await expectResource(ContractType.Take, api('POST', `/api/takes/${take.id}/restore`));
    expect(restored.deletedAt).toBeNull();
    await expectError(api('DELETE', `/api/takes/${MISSING}?confirm=true`), 404, ApiErrorCode.NotFound);
  });
});

describe('Task 4 API: exports', () => {
  it('T4: an export request is recorded as pending and can be fetched', async () => {
    const { session } = await world();
    const created = await expectResource(ContractType.Export, api('POST', `/api/sessions/${session.id}/exports`, { kind: 'per_take' }), 201);
    expect(created.status).toBe('pending');
    expect(await expectResource(ContractType.Export, api('GET', `/api/exports/${created.id}`))).toEqual(created);
    await expectError(api('POST', `/api/sessions/${session.id}/exports`, { kind: 'zip' }), 422, ApiErrorCode.ValidationFailed);
    await expectError(api('GET', `/api/exports/${MISSING}`), 404, ApiErrorCode.NotFound);
  });
});

describe('Task 4 API: every script type is readable', () => {
  it('T4: scripts round-trip through the Script contract', async () => {
    const { script } = await world();
    const fetched: Script = await expectResource(ContractType.Script, api('GET', `/api/scripts/${script.id}`));
    expect(fetched.blocks).toEqual(script.blocks);
  });
});
