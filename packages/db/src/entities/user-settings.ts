import type { CommandAliases, MatchThresholds, Theme } from '@repo/contracts';
import { EntitySchema } from 'typeorm';

export interface UserSettingsRow {
  userId: string;
  defaultVoiceId: string | null;
  defaultRate: number;
  theme: Theme;
  reducedMotion: boolean;
  commandAliases: CommandAliases;
  matchThresholds: MatchThresholds;
  cloudSpeechConsentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSettingsEntity = new EntitySchema<UserSettingsRow>({
  name: 'UserSettings',
  tableName: 'user_settings',
  columns: {
    userId: { name: 'user_id', type: 'uuid', primary: true },
    defaultVoiceId: { name: 'default_voice_id', type: 'varchar', nullable: true },
    defaultRate: { name: 'default_rate', type: 'double precision' },
    theme: { type: 'varchar' },
    reducedMotion: { name: 'reduced_motion', type: 'boolean' },
    commandAliases: { name: 'command_aliases', type: 'jsonb' },
    matchThresholds: { name: 'match_thresholds', type: 'jsonb' },
    cloudSpeechConsentAt: { name: 'cloud_speech_consent_at', type: 'timestamptz', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
