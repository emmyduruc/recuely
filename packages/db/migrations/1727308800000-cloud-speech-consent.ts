import type { MigrationInterface, QueryRunner } from 'typeorm';
import { qualifiedTable, schemaOf } from '../src/sql.ts';

/** Task 10: when the user opted in to cloud speech (SPEC.md §A6.8, §B12). Null = local only. */
export class CloudSpeechConsent1727308800000 implements MigrationInterface {
  name = 'CloudSpeechConsent1727308800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const settings = qualifiedTable(schemaOf(queryRunner), 'user_settings');
    await queryRunner.query(`ALTER TABLE ${settings} ADD COLUMN "cloud_speech_consent_at" timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const settings = qualifiedTable(schemaOf(queryRunner), 'user_settings');
    await queryRunner.query(`ALTER TABLE ${settings} DROP COLUMN "cloud_speech_consent_at"`);
  }
}
