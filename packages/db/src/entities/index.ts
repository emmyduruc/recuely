import { DeviceEntity } from './device.ts';
import { UserEntity } from './user.ts';
import { UserSettingsEntity } from './user-settings.ts';
import { VoiceFavoriteEntity } from './voice-favorite.ts';

export * from './device.ts';
export * from './user.ts';
export * from './user-settings.ts';
export * from './voice-favorite.ts';

export const ALL_ENTITIES = [UserEntity, UserSettingsEntity, VoiceFavoriteEntity, DeviceEntity];
