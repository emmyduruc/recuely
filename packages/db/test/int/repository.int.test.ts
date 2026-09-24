import { Intent, Theme } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { isPgError, PgErrorCode } from '../../src/pg-error.ts';
import {
  addVoiceFavorite,
  findLocalUser,
  getOrCreateSettings,
  listVoiceFavorites,
  removeVoiceFavorite,
  updateSettings,
  updateUser,
} from '../../src/repositories/user-repository.ts';
import { seedLocalUser } from '../../src/seed.ts';
import { UserEntity } from '../../src/entities/user.ts';
import { UserSettingsEntity } from '../../src/entities/user-settings.ts';
import { useTestDataSource } from './helpers.ts';

const ds = useTestDataSource();

describe('seed', () => {
  it('T1: creates the local user with default settings; running it twice creates no duplicates', async () => {
    const first = await seedLocalUser(ds());
    const second = await seedLocalUser(ds());
    expect(first.createdUser).toBe(true);
    expect(second.createdUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(await ds().getRepository(UserEntity).count()).toBe(1);
    expect(await ds().getRepository(UserSettingsEntity).count()).toBe(1);
  });

  it('T1: concurrent seeds still create one user', async () => {
    await Promise.all([seedLocalUser(ds()), seedLocalUser(ds()), seedLocalUser(ds())]);
    expect(await ds().getRepository(UserEntity).count()).toBe(1);
  });
});

describe('user repository', () => {
  it('T1: findLocalUser returns null before seeding', async () => {
    expect(await findLocalUser(ds())).toBeNull();
  });

  it('T1: updateUser persists the patch', async () => {
    const { user } = await seedLocalUser(ds());
    await updateUser(ds(), user, { displayName: 'Ada', email: 'ada@example.com' });
    const reloaded = await findLocalUser(ds());
    expect(reloaded?.displayName).toBe('Ada');
    expect(reloaded?.email).toBe('ada@example.com');
  });

  it('T1: settings are created on demand and patched in place', async () => {
    const { user } = await seedLocalUser(ds());
    await ds().getRepository(UserSettingsEntity).delete({ userId: user.id });
    const created = await getOrCreateSettings(ds(), user.id);
    expect(created.theme).toBe(Theme.Dark);
    await updateSettings(ds(), user.id, { theme: Theme.Light, commandAliases: { [Intent.Next]: ['onward'] } });
    const reloaded = await getOrCreateSettings(ds(), user.id);
    expect(reloaded.theme).toBe(Theme.Light);
    expect(reloaded.commandAliases).toEqual({ [Intent.Next]: ['onward'] });
    expect(reloaded.defaultRate).toBe(1);
  });

  it('T1: voice favorites add, list in order, reject duplicates and remove', async () => {
    const { user } = await seedLocalUser(ds());
    const heart = await addVoiceFavorite(ds(), user.id, { provider: 'kokoro', voiceId: 'af_heart', label: 'Heart' });
    await addVoiceFavorite(ds(), user.id, { provider: 'kokoro', voiceId: 'am_adam', label: 'Adam' });
    expect((await listVoiceFavorites(ds(), user.id)).map((f) => f.voiceId)).toEqual(['af_heart', 'am_adam']);

    const duplicate: unknown = await addVoiceFavorite(ds(), user.id, {
      provider: 'kokoro',
      voiceId: 'af_heart',
      label: 'Again',
    }).catch((error: unknown) => error);
    expect(isPgError(duplicate, PgErrorCode.UniqueViolation)).toBe(true);

    expect(await removeVoiceFavorite(ds(), user.id, heart.id)).toBe(true);
    expect(await removeVoiceFavorite(ds(), user.id, heart.id)).toBe(false);
    expect(await listVoiceFavorites(ds(), user.id)).toHaveLength(1);
  });
});
