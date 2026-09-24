import { DEFAULT_MATCH_THRESHOLDS, DEFAULT_RATE, DEFAULT_THEME, Locale, Theme, UserLimits } from '@repo/contracts';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { qualifiedTable, quoteIdent, schemaOf, sqlStringList } from '../src/sql.ts';

/** Task 1: users, user_settings, voice_favorites, devices. Tables are schema-qualified (SPEC.md §C1.1). */
export class InitUsers1727136000000 implements MigrationInterface {
  name = 'InitUsers1727136000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaOf(queryRunner);
    const users = qualifiedTable(schema, 'users');
    const settings = qualifiedTable(schema, 'user_settings');
    const favorites = qualifiedTable(schema, 'voice_favorites');
    const devices = qualifiedTable(schema, 'devices');
    const index = (name: string): string => quoteIdent(name);

    await queryRunner.query(`
      CREATE TABLE ${users} (
        "id" uuid PRIMARY KEY,
        "email" varchar(${String(UserLimits.emailMax)}),
        "display_name" varchar(${String(UserLimits.displayNameMax)}) NOT NULL,
        "locale" varchar(8) NOT NULL DEFAULT '${Locale.En}',
        "is_local" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "users_locale_check" CHECK ("locale" IN (${sqlStringList(Object.values(Locale))})),
        CONSTRAINT "users_display_name_check" CHECK (length(btrim("display_name")) > 0)
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX ${index('users_email_key')} ON ${users} (lower("email"))`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX ${index('users_single_local_key')} ON ${users} ("is_local") WHERE "is_local"`,
    );

    await queryRunner.query(`
      CREATE TABLE ${settings} (
        "user_id" uuid PRIMARY KEY REFERENCES ${users} ("id") ON DELETE CASCADE,
        "default_voice_id" varchar(${String(UserLimits.voiceIdMax)}),
        "default_rate" double precision NOT NULL DEFAULT ${String(DEFAULT_RATE)},
        "theme" varchar(16) NOT NULL DEFAULT '${DEFAULT_THEME}',
        "reduced_motion" boolean NOT NULL DEFAULT false,
        "command_aliases" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "match_thresholds" jsonb NOT NULL DEFAULT '${JSON.stringify(DEFAULT_MATCH_THRESHOLDS)}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "user_settings_theme_check" CHECK ("theme" IN (${sqlStringList(Object.values(Theme))})),
        CONSTRAINT "user_settings_rate_check"
          CHECK ("default_rate" BETWEEN ${String(UserLimits.rateMin)} AND ${String(UserLimits.rateMax)})
      )`);

    await queryRunner.query(`
      CREATE TABLE ${favorites} (
        "id" uuid PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES ${users} ("id") ON DELETE CASCADE,
        "provider" varchar(${String(UserLimits.providerMax)}) NOT NULL,
        "voice_id" varchar(${String(UserLimits.voiceIdMax)}) NOT NULL,
        "label" varchar(${String(UserLimits.labelMax)}) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "voice_favorites_user_provider_voice_key" UNIQUE ("user_id", "provider", "voice_id")
      )`);

    await queryRunner.query(`
      CREATE TABLE ${devices} (
        "id" uuid PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES ${users} ("id") ON DELETE CASCADE,
        "label" varchar(${String(UserLimits.labelMax)}) NOT NULL,
        "user_agent" text NOT NULL,
        "echo_settle_ms" integer,
        "capability_probe" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "last_seen_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "devices_echo_settle_ms_check" CHECK ("echo_settle_ms" IS NULL OR "echo_settle_ms" >= 0)
      )`);
    await queryRunner.query(`CREATE INDEX ${index('devices_user_id_idx')} ON ${devices} ("user_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaOf(queryRunner);
    for (const table of ['devices', 'voice_favorites', 'user_settings', 'users']) {
      await queryRunner.query(`DROP TABLE ${qualifiedTable(schema, table)}`);
    }
  }
}
