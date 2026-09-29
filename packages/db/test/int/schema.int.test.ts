import { DEFAULT_MATCH_THRESHOLDS, Theme } from '@repo/contracts';
import { describe, expect, inject, it } from 'vitest';
import { UserEntity } from '../../src/entities/user.ts';
import { UserSettingsEntity } from '../../src/entities/user-settings.ts';
import { VoiceFavoriteEntity } from '../../src/entities/voice-favorite.ts';
import { isPgError, PgErrorCode } from '../../src/pg-error.ts';
import { uuidv7 } from '../../src/uuid-v7.ts';
import { useTestDataSource } from './helpers.ts';

const ds = useTestDataSource();
const schema = inject('testSchema');

async function insertUser(email: string | null, isLocal = false): Promise<string> {
  const id = uuidv7();
  await ds().getRepository(UserEntity).insert({ id, email, displayName: 'Someone', isLocal });
  return id;
}

async function tableNames(): Promise<string[]> {
  const rows: { table_name: string }[] = await ds().query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
    [schema],
  );
  return rows.map((row) => row.table_name);
}

async function settingsColumns(): Promise<string[]> {
  const rows: { column_name: string }[] = await ds().query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name',
    [schema, 'user_settings'],
  );
  return rows.map((row) => row.column_name);
}

async function expectPgError(action: Promise<unknown>, code: PgErrorCode): Promise<void> {
  const error: unknown = await action.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isPgError(error, code)).toBe(true);
}

describe('Task 1 schema', () => {
  it('T1/T4/T10: every migration goes down and up again cleanly', async () => {
    const all = [
      'chunk_plans', 'devices', 'exports', 'migrations', 'projects', 'script_blocks', 'script_chunks', 'scripts',
      'sessions', 'takes', 'user_settings', 'users', 'voice_favorites',
    ];
    expect(await tableNames()).toEqual(all);
    expect(await settingsColumns()).toContain('cloud_speech_consent_at');
    await ds().undoLastMigration({ transaction: 'each' });
    expect(await tableNames()).toEqual(all);
    expect(await settingsColumns()).not.toContain('cloud_speech_consent_at');
    await ds().undoLastMigration({ transaction: 'each' });
    expect(await tableNames()).toEqual(['devices', 'migrations', 'user_settings', 'users', 'voice_favorites']);
    await ds().undoLastMigration({ transaction: 'each' });
    expect(await tableNames()).toEqual(['migrations']);
    const applied = await ds().runMigrations({ transaction: 'each' });
    expect(applied.map((m) => m.name)).toEqual(['InitUsers1727136000000', 'InitRecording1727222400000', 'CloudSpeechConsent1727308800000']);
    expect(await tableNames()).toEqual(all);
    expect(await settingsColumns()).toContain('cloud_speech_consent_at');
  });

  it('T1: email is unique, case-insensitively; many users may have no email', async () => {
    await insertUser('ada@example.com');
    await expectPgError(insertUser('ADA@example.com'), PgErrorCode.UniqueViolation);
    await insertUser(null);
    await insertUser(null);
  });

  it('T1: only one local user can exist', async () => {
    await insertUser(null, true);
    await expectPgError(insertUser(null, true), PgErrorCode.UniqueViolation);
  });

  it('T1: locale only accepts Locale values', async () => {
    const id = await insertUser(null);
    await expectPgError(
      ds().query(`UPDATE "${schema}"."users" SET "locale" = 'de' WHERE "id" = $1`, [id]),
      PgErrorCode.CheckViolation,
    );
  });

  it('T1: favorite (user, provider, voice) triple is unique', async () => {
    const userId = await insertUser(null);
    const favorite = { userId, provider: 'kokoro', voiceId: 'af_heart', label: 'Heart' };
    const repository = ds().getRepository(VoiceFavoriteEntity);
    await repository.insert({ id: uuidv7(), ...favorite });
    await expectPgError(repository.insert({ id: uuidv7(), ...favorite, label: 'Again' }), PgErrorCode.UniqueViolation);
    await repository.insert({ id: uuidv7(), ...favorite, provider: 'browser' });
  });

  it('T1: settings are 1:1 with the user and cascade on delete', async () => {
    const userId = await insertUser(null);
    const settings = ds().getRepository(UserSettingsEntity);
    await ds().query(`INSERT INTO "${schema}"."user_settings" ("user_id") VALUES ($1)`, [userId]);
    const row = await settings.findOneByOrFail({ userId });
    expect(row.theme).toBe(Theme.Dark);
    expect(row.matchThresholds).toEqual(DEFAULT_MATCH_THRESHOLDS);
    await expectPgError(
      ds().query(`INSERT INTO "${schema}"."user_settings" ("user_id") VALUES ($1)`, [userId]),
      PgErrorCode.UniqueViolation,
    );
    await ds().getRepository(UserEntity).delete({ id: userId });
    expect(await settings.countBy({ userId })).toBe(0);
  });

  it('T1: rate and theme are range/enum checked in the DB too', async () => {
    const userId = await insertUser(null);
    const table = `"${schema}"."user_settings"`;
    await expectPgError(
      ds().query(`INSERT INTO ${table} ("user_id", "default_rate") VALUES ($1, 5)`, [userId]),
      PgErrorCode.CheckViolation,
    );
    await expectPgError(
      ds().query(`INSERT INTO ${table} ("user_id", "theme") VALUES ($1, 'neon')`, [userId]),
      PgErrorCode.CheckViolation,
    );
  });
});
