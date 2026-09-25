import {
  type ChunkMode,
  type ChunkRange,
  type CreateTakeRequest,
  type ExportKind,
  ExportStatus,
  type ScriptBlock,
  type ScriptChunk,
  SessionState,
  type SourceKind,
  TakeStatus,
  type UpdateProjectRequest,
  type UpdateSessionRequest,
  type UpdateTakeRequest,
} from '@repo/contracts';
import { type DataSource, type EntityManager, IsNull, Not } from 'typeorm';
import {
  ChunkPlanEntity,
  type ChunkPlanRow,
  ExportEntity,
  type ExportRow,
  ProjectEntity,
  type ProjectRow,
  ScriptBlockEntity,
  type ScriptBlockRow,
  ScriptChunkEntity,
  type ScriptChunkRow,
  ScriptEntity,
  type ScriptRow,
  SessionEntity,
  type SessionRow,
  TakeEntity,
  type TakeRow,
} from '../entities/recording.ts';
import { isPgError, PgErrorCode } from '../pg-error.ts';
import { uuidv7 } from '../uuid-v7.ts';

// Persistence for SPEC.md Task 4. Every lookup is scoped to the owner/user, so another user's ids behave as
// "not found". Takes are never deleted here: removal is `deleted_at` (and the DB trigger rejects DELETE).

const ORDINAL_RETRIES = 3;

// ── Projects ────────────────────────────────────────────────────────────────────────────────────────────

export async function listProjects(ds: DataSource, ownerId: string, archived: boolean): Promise<ProjectRow[]> {
  return ds.getRepository(ProjectEntity).find({
    where: { ownerId, archivedAt: archived ? Not(IsNull()) : IsNull() },
    order: { createdAt: 'DESC', id: 'DESC' },
  });
}

export async function createProject(ds: DataSource, ownerId: string, title: string): Promise<ProjectRow> {
  const repository = ds.getRepository(ProjectEntity);
  const id = uuidv7();
  await repository.insert({ id, ownerId, title, archivedAt: null });
  return repository.findOneByOrFail({ id });
}

export async function findProject(ds: DataSource, ownerId: string, id: string): Promise<ProjectRow | null> {
  return ds.getRepository(ProjectEntity).findOneBy({ id, ownerId });
}

function nextArchivedAt(current: Date | null, archived: boolean | undefined): Date | null {
  if (archived === undefined) {
    return current;
  }
  return archived ? (current ?? new Date()) : null;
}

/** `archived: true` archives (idempotent: keeps the first archive time), `false` restores. */
export async function updateProject(ds: DataSource, row: ProjectRow, patch: UpdateProjectRequest): Promise<ProjectRow> {
  return ds.getRepository(ProjectEntity).save({
    ...row,
    ...(patch.title === undefined ? {} : { title: patch.title }),
    archivedAt: nextArchivedAt(row.archivedAt, patch.archived),
  });
}

// ── Scripts ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ScriptWithBlocks {
  script: ScriptRow;
  blocks: ScriptBlockRow[];
}

async function lockRow(manager: EntityManager, entity: typeof ProjectEntity | typeof ScriptEntity, id: string): Promise<void> {
  await manager.getRepository(entity).createQueryBuilder('row').setLock('pessimistic_write').where('row.id = :id', { id }).getOne();
}

async function nextVersion(manager: EntityManager, entity: typeof ScriptEntity | typeof ChunkPlanEntity, column: string, parentId: string): Promise<number> {
  const raw = await manager
    .getRepository(entity)
    .createQueryBuilder('row')
    .select('MAX(row.version)', 'max')
    .where(`row.${column} = :parentId`, { parentId })
    .getRawOne<{ max: number | null }>();
  return (raw?.max ?? 0) + 1;
}

/** Saves a new immutable script version (version = previous + 1) with its blocks. */
export async function createScriptVersion(
  ds: DataSource,
  project: ProjectRow,
  input: { sourceKind: SourceKind; sourceText: string; blocks: readonly ScriptBlock[] },
): Promise<ScriptWithBlocks> {
  return ds.transaction(async (manager) => {
    await lockRow(manager, ProjectEntity, project.id);
    const version = await nextVersion(manager, ScriptEntity, 'projectId', project.id);
    const id = uuidv7();
    await manager.getRepository(ScriptEntity).insert({
      id,
      projectId: project.id,
      version,
      sourceKind: input.sourceKind,
      sourceRef: null,
      sourceText: input.sourceText,
      originalAssetKey: null,
    });
    if (input.blocks.length > 0) {
      await manager.getRepository(ScriptBlockEntity).insert(input.blocks.map((block) => ({ ...block, scriptId: id })));
    }
    return {
      script: await manager.getRepository(ScriptEntity).findOneByOrFail({ id }),
      blocks: await manager.getRepository(ScriptBlockEntity).find({ where: { scriptId: id }, order: { order: 'ASC' } }),
    };
  });
}

export async function latestScript(ds: DataSource, projectId: string): Promise<ScriptRow | null> {
  return ds.getRepository(ScriptEntity).findOne({ where: { projectId }, order: { version: 'DESC' } });
}

export async function scriptBlocks(ds: DataSource, scriptId: string): Promise<ScriptBlockRow[]> {
  return ds.getRepository(ScriptBlockEntity).find({ where: { scriptId }, order: { order: 'ASC' } });
}

export async function listScripts(ds: DataSource, projectId: string): Promise<{ script: ScriptRow; blockCount: number }[]> {
  const scripts = await ds.getRepository(ScriptEntity).find({ where: { projectId }, order: { version: 'ASC' } });
  if (scripts.length === 0) {
    return [];
  }
  const counts = await ds
    .getRepository(ScriptBlockEntity)
    .createQueryBuilder('block')
    .select('block.scriptId', 'scriptId')
    .addSelect('COUNT(*)::int', 'count')
    .where('block.scriptId IN (:...ids)', { ids: scripts.map((script) => script.id) })
    .groupBy('block.scriptId')
    .getRawMany<{ scriptId: string; count: number }>();
  const byScript = new Map(counts.map((row) => [row.scriptId, row.count]));
  return scripts.map((script) => ({ script, blockCount: byScript.get(script.id) ?? 0 }));
}

/** The script if its project belongs to `ownerId`. */
export async function findScript(ds: DataSource, ownerId: string, scriptId: string): Promise<ScriptRow | null> {
  return ds
    .getRepository(ScriptEntity)
    .createQueryBuilder('script')
    .innerJoin(ProjectEntity.options.name, 'project', 'project.id = script.projectId')
    .where('script.id = :scriptId AND project.ownerId = :ownerId', { scriptId, ownerId })
    .getOne();
}

// ── Chunk plans ─────────────────────────────────────────────────────────────────────────────────────────

export interface PlanWithChunks {
  plan: ChunkPlanRow;
  chunks: ScriptChunkRow[];
}

/** Saves a new immutable plan version for a script. */
export async function createChunkPlan(
  ds: DataSource,
  script: ScriptRow,
  mode: ChunkMode,
  chunks: readonly ScriptChunk[],
): Promise<PlanWithChunks> {
  return ds.transaction(async (manager) => {
    await lockRow(manager, ScriptEntity, script.id);
    const version = await nextVersion(manager, ChunkPlanEntity, 'scriptId', script.id);
    const id = uuidv7();
    await manager.getRepository(ChunkPlanEntity).insert({ id, scriptId: script.id, version, mode });
    await manager.getRepository(ScriptChunkEntity).insert(chunks.map((chunk) => ({ ...chunk, chunkPlanId: id })));
    return {
      plan: await manager.getRepository(ChunkPlanEntity).findOneByOrFail({ id }),
      chunks: await manager.getRepository(ScriptChunkEntity).find({ where: { chunkPlanId: id }, order: { order: 'ASC' } }),
    };
  });
}

/** Ranges of every chunk id ever used by a plan of this script (for the id-reuse rule). */
export async function chunkRangesById(ds: DataSource, scriptId: string): Promise<Map<string, ChunkRange[]>> {
  const rows = await ds
    .getRepository(ScriptChunkEntity)
    .createQueryBuilder('chunk')
    .innerJoin(ChunkPlanEntity.options.name, 'plan', 'plan.id = chunk.chunkPlanId')
    .where('plan.scriptId = :scriptId', { scriptId })
    .getMany();
  return new Map(rows.map((row) => [row.id, row.ranges]));
}

export async function findChunkPlan(ds: DataSource, ownerId: string, planId: string): Promise<(PlanWithChunks & { script: ScriptRow }) | null> {
  const plan = await ds
    .getRepository(ChunkPlanEntity)
    .createQueryBuilder('plan')
    .innerJoin(ScriptEntity.options.name, 'script', 'script.id = plan.scriptId')
    .innerJoin(ProjectEntity.options.name, 'project', 'project.id = script.projectId')
    .where('plan.id = :planId AND project.ownerId = :ownerId', { planId, ownerId })
    .getOne();
  if (plan === null) {
    return null;
  }
  const [script, chunks] = await Promise.all([
    ds.getRepository(ScriptEntity).findOneByOrFail({ id: plan.scriptId }),
    ds.getRepository(ScriptChunkEntity).find({ where: { chunkPlanId: plan.id }, order: { order: 'ASC' } }),
  ]);
  return { plan, chunks, script };
}

// ── Sessions ────────────────────────────────────────────────────────────────────────────────────────────

export async function createSession(
  ds: DataSource,
  input: { projectId: string; userId: string; deviceId: string | null; chunkPlanId: string },
): Promise<SessionRow> {
  const repository = ds.getRepository(SessionEntity);
  const id = uuidv7();
  await repository.insert({ id, ...input, state: SessionState.Idle, currentChunkId: null, seq: 0, settings: {}, completedAt: null });
  return repository.findOneByOrFail({ id });
}

export async function findSession(ds: DataSource, userId: string, id: string): Promise<SessionRow | null> {
  return ds.getRepository(SessionEntity).findOneBy({ id, userId });
}

/**
 * Autosave. Applied only if `patch.seq` is greater than the stored seq (one atomic UPDATE), so a late save can
 * never overwrite a newer snapshot (SPEC.md §A6.7). Returns null when the save was stale.
 */
export async function updateSession(ds: DataSource, session: SessionRow, patch: UpdateSessionRequest): Promise<SessionRow | null> {
  const becameCompleted = patch.state === SessionState.Completed && session.completedAt === null;
  return ds.transaction(async (manager) => {
    const result = await manager
      .createQueryBuilder()
      .update(SessionEntity)
      .set({
        seq: patch.seq,
        ...(patch.state === undefined ? {} : { state: patch.state }),
        ...(patch.currentChunkId === undefined ? {} : { currentChunkId: patch.currentChunkId }),
        ...(patch.chunkPlanId === undefined ? {} : { chunkPlanId: patch.chunkPlanId }),
        ...(becameCompleted ? { completedAt: new Date() } : {}),
      })
      .where('id = :id AND seq < :seq', { id: session.id, seq: patch.seq })
      .execute();
    if ((result.affected ?? 0) === 0) {
      return null;
    }
    const repository = manager.getRepository(SessionEntity);
    const current = await repository.findOneByOrFail({ id: session.id });
    return patch.settings === undefined ? current : repository.save({ ...current, settings: patch.settings });
  });
}

// ── Takes ───────────────────────────────────────────────────────────────────────────────────────────────

export async function chunkExists(ds: DataSource, chunkPlanId: string, chunkId: string): Promise<boolean> {
  return ds.getRepository(ScriptChunkEntity).existsBy({ chunkPlanId, id: chunkId });
}

async function insertTake(ds: DataSource, session: SessionRow, input: CreateTakeRequest): Promise<TakeRow> {
  return ds.transaction(async (manager) => {
    const raw = await manager
      .getRepository(TakeEntity)
      .createQueryBuilder('take')
      .select('MAX(take.ordinal)', 'max')
      .where('take.sessionId = :sessionId AND take.chunkId = :chunkId', { sessionId: session.id, chunkId: input.chunkId })
      .getRawOne<{ max: number | null }>();
    const id = uuidv7();
    // save(), not insert(): TypeORM's insert typing can't express free-form jsonb (`timing`).
    await manager.getRepository(TakeEntity).save({
      id,
      sessionId: session.id,
      chunkPlanId: session.chunkPlanId,
      chunkId: input.chunkId,
      ordinal: (raw?.max ?? 0) + 1,
      status: TakeStatus.Recording,
      selected: false,
      mediaKey: null,
      mimeType: input.mimeType,
      kind: input.kind,
      bytes: 0,
      durationMs: input.durationMs ?? null,
      timing: input.timing ?? null,
      transcript: null,
      match: null,
      deletedAt: null,
    });
    return manager.getRepository(TakeEntity).findOneByOrFail({ id });
  });
}

/** Creates the take row (before its media). Ordinals are 1, 2, … per session and chunk; races retry. */
export async function createTake(ds: DataSource, session: SessionRow, input: CreateTakeRequest): Promise<TakeRow> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await insertTake(ds, session, input);
    } catch (error) {
      if (attempt >= ORDINAL_RETRIES || !isPgError(error, PgErrorCode.UniqueViolation)) {
        throw error;
      }
    }
  }
}

export async function listTakes(ds: DataSource, sessionId: string, includeDeleted: boolean): Promise<TakeRow[]> {
  return ds.getRepository(TakeEntity).find({
    where: includeDeleted ? { sessionId } : { sessionId, deletedAt: IsNull() },
    order: { createdAt: 'ASC', id: 'ASC' },
  });
}

/** The take if its session belongs to `userId`. */
export async function findTake(ds: DataSource, userId: string, id: string): Promise<TakeRow | null> {
  return ds
    .getRepository(TakeEntity)
    .createQueryBuilder('take')
    .innerJoin(SessionEntity.options.name, 'session', 'session.id = take.sessionId')
    .where('take.id = :id AND session.userId = :userId', { id, userId })
    .getOne();
}

/** Applies a patch; selecting a take first unselects the other takes of its chunk (one transaction). */
export async function updateTake(ds: DataSource, take: TakeRow, patch: UpdateTakeRequest): Promise<TakeRow> {
  return ds.transaction(async (manager) => {
    const repository = manager.getRepository(TakeEntity);
    if (patch.selected === true) {
      await manager
        .createQueryBuilder()
        .update(TakeEntity)
        .set({ selected: false })
        .where('session_id = :sessionId AND chunk_id = :chunkId AND id <> :id AND selected', {
          sessionId: take.sessionId,
          chunkId: take.chunkId,
          id: take.id,
        })
        .execute();
    }
    const current = await repository.findOneByOrFail({ id: take.id });
    await repository.save({
      ...current,
      ...(patch.selected === undefined ? {} : { selected: patch.selected }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.durationMs === undefined ? {} : { durationMs: patch.durationMs }),
      ...(patch.timing === undefined ? {} : { timing: patch.timing }),
      ...(patch.transcript === undefined ? {} : { transcript: patch.transcript }),
      ...(patch.match === undefined ? {} : { match: patch.match }),
    });
    return repository.findOneByOrFail({ id: take.id });
  });
}

/** Soft delete: the row and the media stay; the take is unselected and hidden from default lists. */
export async function softDeleteTake(ds: DataSource, take: TakeRow): Promise<TakeRow> {
  const repository = ds.getRepository(TakeEntity);
  await repository.update({ id: take.id }, { deletedAt: take.deletedAt ?? new Date(), selected: false });
  return repository.findOneByOrFail({ id: take.id });
}

export async function restoreTake(ds: DataSource, take: TakeRow): Promise<TakeRow> {
  const repository = ds.getRepository(TakeEntity);
  await repository.update({ id: take.id }, { deletedAt: null });
  return repository.findOneByOrFail({ id: take.id });
}

/** Records the uploaded media once. Returns null if media was already attached (never overwritten). */
export async function attachTakeMedia(ds: DataSource, take: TakeRow, mediaKey: string, bytes: number): Promise<TakeRow | null> {
  const result = await ds
    .createQueryBuilder()
    .update(TakeEntity)
    .set({ mediaKey, bytes, status: take.status === TakeStatus.Recording ? TakeStatus.Complete : take.status })
    .where('id = :id AND media_key IS NULL', { id: take.id })
    .execute();
  if ((result.affected ?? 0) === 0) {
    return null;
  }
  return ds.getRepository(TakeEntity).findOneByOrFail({ id: take.id });
}

// ── Exports ─────────────────────────────────────────────────────────────────────────────────────────────

export async function createExport(ds: DataSource, sessionId: string, kind: ExportKind): Promise<ExportRow> {
  const repository = ds.getRepository(ExportEntity);
  const id = uuidv7();
  await repository.insert({ id, sessionId, status: ExportStatus.Pending, kind, mediaKey: null, error: null });
  return repository.findOneByOrFail({ id });
}

export async function findExport(ds: DataSource, userId: string, id: string): Promise<ExportRow | null> {
  return ds
    .getRepository(ExportEntity)
    .createQueryBuilder('export')
    .innerJoin(SessionEntity.options.name, 'session', 'session.id = export.sessionId')
    .where('export.id = :id AND session.userId = :userId', { id, userId })
    .getOne();
}
