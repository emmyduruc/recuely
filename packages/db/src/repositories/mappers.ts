import type { UpdateMeRequest, UpdateSettingsRequest, User, UserSettings, VoiceFavorite } from '@repo/contracts';
import { DEFAULT_MATCH_THRESHOLDS, DEFAULT_RATE, DEFAULT_THEME } from '@repo/contracts';
import type { UserRow } from '../entities/user.ts';
import type { UserSettingsRow } from '../entities/user-settings.ts';
import type { VoiceFavoriteRow } from '../entities/voice-favorite.ts';

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    locale: row.locale,
    isLocal: row.isLocal,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toUserSettings(row: UserSettingsRow): UserSettings {
  return {
    defaultVoiceId: row.defaultVoiceId,
    defaultRate: row.defaultRate,
    theme: row.theme,
    reducedMotion: row.reducedMotion,
    commandAliases: row.commandAliases,
    matchThresholds: row.matchThresholds,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toVoiceFavorite(row: VoiceFavoriteRow): VoiceFavorite {
  return {
    id: row.id,
    provider: row.provider,
    voiceId: row.voiceId,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  };
}

export function defaultSettingsRow(userId: string, now: Date): UserSettingsRow {
  return {
    userId,
    defaultVoiceId: null,
    defaultRate: DEFAULT_RATE,
    theme: DEFAULT_THEME,
    reducedMotion: false,
    commandAliases: {},
    matchThresholds: { ...DEFAULT_MATCH_THRESHOLDS },
    createdAt: now,
    updatedAt: now,
  };
}

/** Only fields present in the patch change; everything else is kept. */
export function applyUserPatch(row: UserRow, patch: UpdateMeRequest): UserRow {
  return {
    ...row,
    ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
    ...(patch.email === undefined ? {} : { email: patch.email }),
    ...(patch.locale === undefined ? {} : { locale: patch.locale }),
  };
}

/** Only fields present in the patch change. `commandAliases` and `matchThresholds` are replaced whole. */
export function applySettingsPatch(row: UserSettingsRow, patch: UpdateSettingsRequest): UserSettingsRow {
  return {
    ...row,
    ...(patch.defaultVoiceId === undefined ? {} : { defaultVoiceId: patch.defaultVoiceId }),
    ...(patch.defaultRate === undefined ? {} : { defaultRate: patch.defaultRate }),
    ...(patch.theme === undefined ? {} : { theme: patch.theme }),
    ...(patch.reducedMotion === undefined ? {} : { reducedMotion: patch.reducedMotion }),
    ...(patch.commandAliases === undefined ? {} : { commandAliases: patch.commandAliases }),
    ...(patch.matchThresholds === undefined ? {} : { matchThresholds: patch.matchThresholds }),
  };
}
