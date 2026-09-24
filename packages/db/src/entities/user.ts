import { Locale, UserLimits } from '@repo/contracts';
import { EntitySchema } from 'typeorm';

export interface UserRow {
  id: string;
  email: string | null;
  displayName: string;
  locale: Locale;
  isLocal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const UserEntity = new EntitySchema<UserRow>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: { type: 'uuid', primary: true },
    email: { type: 'varchar', length: UserLimits.emailMax, nullable: true },
    displayName: { name: 'display_name', type: 'varchar', length: UserLimits.displayNameMax },
    locale: { type: 'varchar', length: 8, default: Locale.En },
    isLocal: { name: 'is_local', type: 'boolean', default: false },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
