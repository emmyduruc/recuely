import type { AddVoiceFavoriteRequest, UpdateMeRequest, UpdateSettingsRequest } from '@repo/contracts';
import type { DataSource } from 'typeorm';
import { UserEntity, type UserRow } from '../entities/user.ts';
import { UserSettingsEntity, type UserSettingsRow } from '../entities/user-settings.ts';
import { VoiceFavoriteEntity, type VoiceFavoriteRow } from '../entities/voice-favorite.ts';
import { uuidv7 } from '../uuid-v7.ts';
import { applySettingsPatch, applyUserPatch, defaultSettingsRow } from './mappers.ts';

/** R1 runs as one seeded local user (SPEC.md §B4). */
export async function findLocalUser(ds: DataSource): Promise<UserRow | null> {
  return ds.getRepository(UserEntity).findOneBy({ isLocal: true });
}

export async function updateUser(ds: DataSource, row: UserRow, patch: UpdateMeRequest): Promise<UserRow> {
  return ds.getRepository(UserEntity).save(applyUserPatch(row, patch));
}

/** Returns the user's settings, creating the defaults if the row is missing. */
export async function getOrCreateSettings(ds: DataSource, userId: string): Promise<UserSettingsRow> {
  const repository = ds.getRepository(UserSettingsEntity);
  const existing = await repository.findOneBy({ userId });
  if (existing !== null) {
    return existing;
  }
  await repository
    .createQueryBuilder()
    .insert()
    .values(defaultSettingsRow(userId, new Date()))
    .orIgnore()
    .execute();
  return repository.findOneByOrFail({ userId });
}

export async function updateSettings(
  ds: DataSource,
  userId: string,
  patch: UpdateSettingsRequest,
): Promise<UserSettingsRow> {
  const current = await getOrCreateSettings(ds, userId);
  return ds.getRepository(UserSettingsEntity).save(applySettingsPatch(current, patch));
}

export async function listVoiceFavorites(ds: DataSource, userId: string): Promise<VoiceFavoriteRow[]> {
  return ds.getRepository(VoiceFavoriteEntity).find({ where: { userId }, order: { createdAt: 'ASC', id: 'ASC' } });
}

/** Throws a unique-violation `QueryFailedError` when the (user, provider, voice) triple already exists. */
export async function addVoiceFavorite(
  ds: DataSource,
  userId: string,
  request: AddVoiceFavoriteRequest,
): Promise<VoiceFavoriteRow> {
  const repository = ds.getRepository(VoiceFavoriteEntity);
  const row = repository.create({ id: uuidv7(), userId, ...request });
  await repository.insert(row);
  return repository.findOneByOrFail({ id: row.id });
}

/** Returns false when no favorite with that id belongs to the user. */
export async function removeVoiceFavorite(ds: DataSource, userId: string, id: string): Promise<boolean> {
  const result = await ds.getRepository(VoiceFavoriteEntity).delete({ id, userId });
  return (result.affected ?? 0) > 0;
}
