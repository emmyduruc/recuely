import { DEFAULT_LOCALE, LOCAL_USER_DISPLAY_NAME } from '@repo/contracts';
import type { DataSource } from 'typeorm';
import { UserEntity, type UserRow } from './entities/user.ts';
import { getOrCreateSettings } from './repositories/user-repository.ts';
import { uuidv7 } from './uuid-v7.ts';

export interface SeedResult {
  user: UserRow;
  createdUser: boolean;
}

/**
 * Idempotent: creates the local user and default settings only if missing.
 * The partial unique index on `is_local` makes concurrent seeds safe (ON CONFLICT DO NOTHING).
 */
export async function seedLocalUser(ds: DataSource): Promise<SeedResult> {
  const repository = ds.getRepository(UserEntity);
  const candidateId = uuidv7();
  await repository
    .createQueryBuilder()
    .insert()
    .values({
      id: candidateId,
      email: null,
      displayName: LOCAL_USER_DISPLAY_NAME,
      locale: DEFAULT_LOCALE,
      isLocal: true,
    })
    .orIgnore()
    .execute();
  const user = await repository.findOneByOrFail({ isLocal: true });
  await getOrCreateSettings(ds, user.id);
  return { user, createdUser: user.id === candidateId };
}
