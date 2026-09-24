import { EntitySchema } from 'typeorm';

export interface VoiceFavoriteRow {
  id: string;
  userId: string;
  provider: string;
  voiceId: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
}

export const VoiceFavoriteEntity = new EntitySchema<VoiceFavoriteRow>({
  name: 'VoiceFavorite',
  tableName: 'voice_favorites',
  columns: {
    id: { type: 'uuid', primary: true },
    userId: { name: 'user_id', type: 'uuid' },
    provider: { type: 'varchar' },
    voiceId: { name: 'voice_id', type: 'varchar' },
    label: { type: 'varchar' },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
