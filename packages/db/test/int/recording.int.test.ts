import { BlockType, ChunkMode, type ScriptBlock, type ScriptChunk, SessionState, SourceKind, TakeKind, TakeStatus } from '@repo/contracts';
import { describe, expect, inject, it } from 'vitest';
import { TakeEntity, UserEntity } from '../../src/entities/index.ts';
import { isPgError, PgErrorCode } from '../../src/pg-error.ts';
import {
  attachTakeMedia,
  createChunkPlan,
  createProject,
  createScriptVersion,
  createSession,
  createTake,
  findChunkPlan,
  findProject,
  findScript,
  findSession,
  findTake,
  listProjects,
  listTakes,
  restoreTake,
  softDeleteTake,
  updateProject,
  updateSession,
  updateTake,
} from '../../src/repositories/recording.ts';
import { seedLocalUser } from '../../src/seed.ts';
import { uuidv7 } from '../../src/uuid-v7.ts';
import { useTestDataSource } from './helpers.ts';

const ds = useTestDataSource();
const schema = inject('testSchema');

const TEXT = 'One two. Three four.';

function blocks(): ScriptBlock[] {
  return [{ id: uuidv7(), order: 0, type: BlockType.Spoken, text: TEXT, source: { start: 0, end: TEXT.length }, metadata: {} }];
}

function chunk(blockId: string, order: number, start: number, end: number, id: string = uuidv7()): ScriptChunk {
  const text = TEXT.slice(start, end);
  return { id, order, ranges: [{ blockId, start, end }], text, spokenText: text, sceneCue: null };
}

async function world() {
  const { user } = await seedLocalUser(ds());
  const project = await createProject(ds(), user.id, 'Launch');
  const { script, blocks: savedBlocks } = await createScriptVersion(ds(), project, {
    sourceKind: SourceKind.Paste,
    sourceText: TEXT,
    blocks: blocks(),
  });
  const blockId = savedBlocks[0]?.id ?? '';
  const first = chunk(blockId, 0, 0, 8);
  const second = chunk(blockId, 1, 9, 20);
  const { plan } = await createChunkPlan(ds(), script, ChunkMode.Sentence, [first, second]);
  const session = await createSession(ds(), { projectId: project.id, userId: user.id, deviceId: null, chunkPlanId: plan.id });
  return { user, project, script, blockId, plan, first, second, session };
}

async function pgError(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('Task 4: projects, scripts, plans', () => {
  it('T4: projects archive and restore; lists filter by archived', async () => {
    const { user, project } = await world();
    const archived = await updateProject(ds(), project, { archived: true });
    expect(archived.archivedAt).not.toBeNull();
    expect(await listProjects(ds(), user.id, false)).toEqual([]);
    expect((await listProjects(ds(), user.id, true)).map((p) => p.id)).toEqual([project.id]);
    const again = await updateProject(ds(), archived, { archived: true });
    expect(again.archivedAt).toEqual(archived.archivedAt);
    expect((await updateProject(ds(), again, { archived: false })).archivedAt).toBeNull();
  });

  it('T4: script and plan versions count up per parent', async () => {
    const { project, script, blockId } = await world();
    const v2 = await createScriptVersion(ds(), project, { sourceKind: SourceKind.Paste, sourceText: TEXT, blocks: blocks() });
    expect([script.version, v2.script.version]).toEqual([1, 2]);
    const p2 = await createChunkPlan(ds(), script, ChunkMode.Paragraph, [chunk(blockId, 0, 0, 20)]);
    expect(p2.plan.version).toBe(2);
  });

  it('T4: another user sees nothing', async () => {
    const { project, script, plan, session } = await world();
    const stranger = uuidv7();
    await ds().getRepository(UserEntity).insert({ id: stranger, email: null, displayName: 'Other', isLocal: false });
    expect(await findProject(ds(), stranger, project.id)).toBeNull();
    expect(await findScript(ds(), stranger, script.id)).toBeNull();
    expect(await findChunkPlan(ds(), stranger, plan.id)).toBeNull();
    expect(await findSession(ds(), stranger, session.id)).toBeNull();
  });
});

describe('Task 4: sessions', () => {
  it('T4: autosave applies only with a greater seq; stale saves return null', async () => {
    const { session, first } = await world();
    const saved = await updateSession(ds(), session, { seq: 5, state: SessionState.Ready, currentChunkId: first.id, settings: { a: 1 } });
    expect(saved).toMatchObject({ seq: 5, state: SessionState.Ready, currentChunkId: first.id, settings: { a: 1 } });
    expect(await updateSession(ds(), session, { seq: 5, state: SessionState.Paused })).toBeNull();
    expect(await updateSession(ds(), session, { seq: 4 })).toBeNull();
    expect((await findSession(ds(), session.userId, session.id))?.state).toBe(SessionState.Ready);
  });

  it('T4: reaching completed stamps completedAt once', async () => {
    const { session } = await world();
    const done = await updateSession(ds(), session, { seq: 1, state: SessionState.Completed });
    expect(done?.completedAt).not.toBeNull();
  });

  it('T4: the current chunk must belong to the session plan', async () => {
    const { session } = await world();
    const error = await pgError(updateSession(ds(), session, { seq: 1, currentChunkId: uuidv7() }));
    expect(isPgError(error, PgErrorCode.ForeignKeyViolation)).toBe(true);
  });
});

describe('Task 4: takes are structurally protected', () => {
  async function take(session: Awaited<ReturnType<typeof world>>['session'], chunkId: string) {
    return createTake(ds(), session, { chunkId, kind: TakeKind.Video, mimeType: 'video/webm' });
  }

  it('T4: ordinals count up per session and chunk, also under concurrency', async () => {
    const { session, first, second } = await world();
    await Promise.all([take(session, first.id), take(session, first.id), take(session, first.id)]);
    await take(session, second.id);
    const ordinals = (await listTakes(ds(), session.id, false)).map((t) => [t.chunkId === first.id, t.ordinal]);
    expect(ordinals.filter(([isFirst]) => isFirst).map(([, ordinal]) => ordinal).sort()).toEqual([1, 2, 3]);
    expect(ordinals.filter(([isFirst]) => !isFirst)).toEqual([[false, 1]]);
  });

  it('T4: three takes, select one: exactly one selected, all three recoverable', async () => {
    const { session, first } = await world();
    const takes = [await take(session, first.id), await take(session, first.id), await take(session, first.id)];
    for (const [index, row] of takes.entries()) {
      await attachTakeMedia(ds(), row, `takes/${session.id}/${row.id}.webm`, 100 + index);
    }
    const [firstChoice, , chosen] = takes;
    if (firstChoice === undefined || chosen === undefined) {
      throw new Error('setup');
    }
    await updateTake(ds(), firstChoice, { selected: true });
    await updateTake(ds(), chosen, { selected: true });
    const all = await listTakes(ds(), session.id, false);
    expect(all.filter((t) => t.selected).map((t) => t.id)).toEqual([chosen.id]);
    expect(all).toHaveLength(3);
    expect(all.every((t) => t.mediaKey !== null && t.deletedAt === null)).toBe(true);
  });

  it('T4: the DB allows only one selected take per chunk', async () => {
    const { session, first } = await world();
    const a = await take(session, first.id);
    const b = await take(session, first.id);
    const repository = ds().getRepository(TakeEntity);
    await repository.update({ id: a.id }, { selected: true });
    expect(isPgError(await pgError(repository.update({ id: b.id }, { selected: true })), PgErrorCode.UniqueViolation)).toBe(true);
  });

  it('T4: a DELETE on takes is rejected by the trigger, even as raw SQL', async () => {
    const { session, first } = await world();
    const row = await take(session, first.id);
    const error = await pgError(ds().query(`DELETE FROM "${schema}"."takes" WHERE "id" = $1`, [row.id]));
    expect(isPgError(error, PgErrorCode.RestrictViolation)).toBe(true);
    expect(isPgError(await pgError(ds().getRepository(TakeEntity).delete({ id: row.id })), PgErrorCode.RestrictViolation)).toBe(true);
    expect(await ds().getRepository(TakeEntity).countBy({ id: row.id })).toBe(1);
  });

  it('T4: soft delete unselects and hides; restore brings it back; a deleted take cannot be selected', async () => {
    const { session, first, user } = await world();
    const row = await take(session, first.id);
    await updateTake(ds(), row, { selected: true });
    const deleted = await softDeleteTake(ds(), row);
    expect(deleted.selected).toBe(false);
    expect(deleted.deletedAt).not.toBeNull();
    expect(await listTakes(ds(), session.id, false)).toEqual([]);
    expect(await listTakes(ds(), session.id, true)).toHaveLength(1);
    const repository = ds().getRepository(TakeEntity);
    expect(isPgError(await pgError(repository.update({ id: row.id }, { selected: true })), PgErrorCode.CheckViolation)).toBe(true);
    expect((await restoreTake(ds(), deleted)).deletedAt).toBeNull();
    expect((await findTake(ds(), user.id, row.id))?.deletedAt).toBeNull();
  });

  it('T4: media attaches once and is never overwritten', async () => {
    const { session, first } = await world();
    const row = await take(session, first.id);
    const attached = await attachTakeMedia(ds(), row, 'takes/a.webm', 10);
    expect(attached).toMatchObject({ mediaKey: 'takes/a.webm', bytes: 10, status: TakeStatus.Complete });
    expect(await attachTakeMedia(ds(), row, 'takes/b.webm', 20)).toBeNull();
    expect((await ds().getRepository(TakeEntity).findOneByOrFail({ id: row.id })).mediaKey).toBe('takes/a.webm');
  });

  it('T4: a new chunk plan never re-links existing takes', async () => {
    const { script, blockId, session, first, plan } = await world();
    const row = await take(session, first.id);
    // Plan v2 changes the first chunk (new id) and keeps the second.
    await createChunkPlan(ds(), script, ChunkMode.Paragraph, [chunk(blockId, 0, 0, 20)]);
    const reloaded = await ds().getRepository(TakeEntity).findOneByOrFail({ id: row.id });
    expect(reloaded.chunkPlanId).toBe(plan.id);
    expect(reloaded.chunkId).toBe(first.id);
    const originalChunk = (await findChunkPlan(ds(), session.userId, plan.id))?.chunks.find((c) => c.id === first.id);
    expect(originalChunk?.text).toBe('One two.');
  });
});
