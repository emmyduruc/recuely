import type { Intent } from './intent.ts';
import type { Locale } from './locale.ts';
import type { Theme } from './theme.ts';

/** The current (local) user, `GET /api/me`. Timestamps are ISO 8601. */
export interface User {
  id: string;
  email: string | null;
  displayName: string;
  locale: Locale;
  isLocal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateMeRequest {
  displayName?: string;
  email?: string | null;
  locale?: Locale;
}

export interface MatchThresholds {
  coverage: number;
  similarity: number;
}

export type CommandAliases = Partial<Record<Intent, string[]>>;

export interface UserSettings {
  defaultVoiceId: string | null;
  defaultRate: number;
  theme: Theme;
  reducedMotion: boolean;
  commandAliases: CommandAliases;
  matchThresholds: MatchThresholds;
  updatedAt: string;
}

export interface UpdateSettingsRequest {
  defaultVoiceId?: string | null;
  defaultRate?: number;
  theme?: Theme;
  reducedMotion?: boolean;
  commandAliases?: CommandAliases;
  matchThresholds?: MatchThresholds;
}

export interface VoiceFavorite {
  id: string;
  provider: string;
  voiceId: string;
  label: string;
  createdAt: string;
}

export interface AddVoiceFavoriteRequest {
  provider: string;
  voiceId: string;
  label: string;
}

/** Limits shared by validation, the DB constraints and the API docs. */
export const UserLimits = {
  displayNameMax: 120,
  emailMax: 320,
  voiceIdMax: 128,
  providerMax: 64,
  labelMax: 120,
  rateMin: 0.5,
  rateMax: 2,
  aliasMax: 60,
  aliasesPerIntentMax: 20,
} as const;

export const DEFAULT_MATCH_THRESHOLDS: MatchThresholds = { coverage: 0.8, similarity: 0.7 };
export const DEFAULT_RATE = 1;
export const LOCAL_USER_DISPLAY_NAME = 'Local creator';
