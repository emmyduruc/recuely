import {
  BlockType,
  ChunkMode,
  ExportKind,
  ExportStatus,
  RecordingLimits,
  SessionState,
  SourceKind,
  TakeKind,
  TakeStatus,
} from '@repo/contracts';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { qualifiedTable, quoteIdent, schemaOf, sqlStringList } from '../src/sql.ts';

/** Children first, so drops respect foreign keys. */
const TABLES = ['exports', 'takes', 'sessions', 'script_chunks', 'chunk_plans', 'script_blocks', 'scripts', 'projects'] as const;
const FORBID_TAKE_DELETE = 'forbid_take_delete';

const values = (set: Readonly<Record<string, string>>): string => sqlStringList(Object.values(set));

/**
 * Task 4: projects, scripts, blocks, chunk plans, chunks, sessions, takes, exports (SPEC.md §B4).
 * Takes are protected structurally: a trigger rejects every DELETE, parents are ON DELETE RESTRICT, and a
 * deleted take can't be the selected one.
 */
export class InitRecording1727222400000 implements MigrationInterface {
  name = 'InitRecording1727222400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaOf(queryRunner);
    const t = (table: string): string => qualifiedTable(schema, table);
    const stamps = `"created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()`;

    await queryRunner.query(`
      CREATE TABLE ${t('projects')} (
        "id" uuid PRIMARY KEY,
        "owner_id" uuid NOT NULL REFERENCES ${t('users')} ("id") ON DELETE RESTRICT,
        "title" varchar(${String(RecordingLimits.titleMax)}) NOT NULL CHECK (length(btrim("title")) > 0),
        "archived_at" timestamptz,
        ${stamps}
      )`);
    await queryRunner.query(`CREATE INDEX ${quoteIdent('projects_owner_idx')} ON ${t('projects')} ("owner_id")`);

    await queryRunner.query(`
      CREATE TABLE ${t('scripts')} (
        "id" uuid PRIMARY KEY,
        "project_id" uuid NOT NULL REFERENCES ${t('projects')} ("id") ON DELETE RESTRICT,
        "version" integer NOT NULL CHECK ("version" >= 1),
        "source_kind" varchar(16) NOT NULL CHECK ("source_kind" IN (${values(SourceKind)})),
        "source_ref" text,
        "source_text" text NOT NULL,
        "original_asset_key" text,
        ${stamps},
        CONSTRAINT "scripts_project_version_key" UNIQUE ("project_id", "version")
      )`);

    await queryRunner.query(`
      CREATE TABLE ${t('script_blocks')} (
        "script_id" uuid NOT NULL REFERENCES ${t('scripts')} ("id") ON DELETE RESTRICT,
        "id" uuid NOT NULL,
        "order" integer NOT NULL CHECK ("order" >= 0),
        "type" varchar(16) NOT NULL CHECK ("type" IN (${values(BlockType)})),
        "text" text NOT NULL,
        "source" jsonb NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ${stamps},
        PRIMARY KEY ("script_id", "id"),
        CONSTRAINT "script_blocks_script_order_key" UNIQUE ("script_id", "order")
      )`);

    await queryRunner.query(`
      CREATE TABLE ${t('chunk_plans')} (
        "id" uuid PRIMARY KEY,
        "script_id" uuid NOT NULL REFERENCES ${t('scripts')} ("id") ON DELETE RESTRICT,
        "version" integer NOT NULL CHECK ("version" >= 1),
        "mode" varchar(16) NOT NULL CHECK ("mode" IN (${values(ChunkMode)})),
        ${stamps},
        CONSTRAINT "chunk_plans_script_version_key" UNIQUE ("script_id", "version")
      )`);

    await queryRunner.query(`
      CREATE TABLE ${t('script_chunks')} (
        "chunk_plan_id" uuid NOT NULL REFERENCES ${t('chunk_plans')} ("id") ON DELETE RESTRICT,
        "id" uuid NOT NULL,
        "order" integer NOT NULL CHECK ("order" >= 0),
        "ranges" jsonb NOT NULL,
        "text" text NOT NULL,
        "spoken_text" text NOT NULL,
        "scene_cue" jsonb,
        ${stamps},
        PRIMARY KEY ("chunk_plan_id", "id"),
        CONSTRAINT "script_chunks_plan_order_key" UNIQUE ("chunk_plan_id", "order")
      )`);

    await queryRunner.query(`
      CREATE TABLE ${t('sessions')} (
        "id" uuid PRIMARY KEY,
        "project_id" uuid NOT NULL REFERENCES ${t('projects')} ("id") ON DELETE RESTRICT,
        "user_id" uuid NOT NULL REFERENCES ${t('users')} ("id") ON DELETE RESTRICT,
        "device_id" uuid REFERENCES ${t('devices')} ("id") ON DELETE SET NULL,
        "chunk_plan_id" uuid NOT NULL REFERENCES ${t('chunk_plans')} ("id") ON DELETE RESTRICT,
        "state" varchar(32) NOT NULL CHECK ("state" IN (${values(SessionState)})),
        "current_chunk_id" uuid,
        "seq" bigint NOT NULL DEFAULT 0 CHECK ("seq" >= 0),
        "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "completed_at" timestamptz,
        ${stamps},
        CONSTRAINT "sessions_current_chunk_fkey" FOREIGN KEY ("chunk_plan_id", "current_chunk_id")
          REFERENCES ${t('script_chunks')} ("chunk_plan_id", "id")
      )`);
    await queryRunner.query(`CREATE INDEX ${quoteIdent('sessions_project_idx')} ON ${t('sessions')} ("project_id")`);

    await queryRunner.query(`
      CREATE TABLE ${t('takes')} (
        "id" uuid PRIMARY KEY,
        "session_id" uuid NOT NULL REFERENCES ${t('sessions')} ("id") ON DELETE RESTRICT,
        "chunk_plan_id" uuid NOT NULL,
        "chunk_id" uuid NOT NULL,
        "ordinal" integer NOT NULL CHECK ("ordinal" >= 1),
        "status" varchar(16) NOT NULL CHECK ("status" IN (${values(TakeStatus)})),
        "selected" boolean NOT NULL DEFAULT false,
        "media_key" text,
        "mime_type" varchar(100) NOT NULL,
        "kind" varchar(8) NOT NULL CHECK ("kind" IN (${values(TakeKind)})),
        "bytes" bigint NOT NULL DEFAULT 0 CHECK ("bytes" >= 0),
        "duration_ms" integer CHECK ("duration_ms" >= 0),
        "timing" jsonb,
        "transcript" jsonb,
        "match" jsonb,
        "deleted_at" timestamptz,
        ${stamps},
        CONSTRAINT "takes_chunk_fkey" FOREIGN KEY ("chunk_plan_id", "chunk_id")
          REFERENCES ${t('script_chunks')} ("chunk_plan_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "takes_session_chunk_ordinal_key" UNIQUE ("session_id", "chunk_id", "ordinal"),
        CONSTRAINT "takes_deleted_not_selected_check" CHECK (NOT "selected" OR "deleted_at" IS NULL)
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX ${quoteIdent('takes_one_selected_per_chunk')} ON ${t('takes')} ("session_id", "chunk_id") WHERE "selected"`,
    );
    await queryRunner.query(`CREATE INDEX ${quoteIdent('takes_session_idx')} ON ${t('takes')} ("session_id")`);
    await queryRunner.query(`
      CREATE FUNCTION ${qualifiedTable(schema, FORBID_TAKE_DELETE)}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'takes are never deleted; set deleted_at instead' USING ERRCODE = 'restrict_violation';
      END
      $$`);
    await queryRunner.query(
      `CREATE TRIGGER ${quoteIdent('takes_forbid_delete')} BEFORE DELETE ON ${t('takes')} FOR EACH ROW EXECUTE FUNCTION ${qualifiedTable(schema, FORBID_TAKE_DELETE)}()`,
    );

    await queryRunner.query(`
      CREATE TABLE ${t('exports')} (
        "id" uuid PRIMARY KEY,
        "session_id" uuid NOT NULL REFERENCES ${t('sessions')} ("id") ON DELETE RESTRICT,
        "status" varchar(16) NOT NULL CHECK ("status" IN (${values(ExportStatus)})),
        "kind" varchar(16) NOT NULL CHECK ("kind" IN (${values(ExportKind)})),
        "media_key" text,
        "error" text,
        ${stamps}
      )`);

    // Supabase's Data API exposes `public`; RLS without policies denies it (SPEC.md §C1.1).
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE ${t(table)} ENABLE ROW LEVEL SECURITY`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaOf(queryRunner);
    for (const table of TABLES) {
      await queryRunner.query(`DROP TABLE ${qualifiedTable(schema, table)}`);
    }
    await queryRunner.query(`DROP FUNCTION ${qualifiedTable(schema, FORBID_TAKE_DELETE)}()`);
  }
}
