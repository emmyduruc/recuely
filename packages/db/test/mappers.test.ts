import { DEFAULT_MATCH_THRESHOLDS, Intent, Locale, Theme } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import type { UserRow } from '../src/entities/user.ts';
import {
  applySettingsPatch,
  applyUserPatch,
  defaultSettingsRow,
  toUser,
  toUserSettings,
} from '../src/repositories/mappers.ts';

const now = new Date('2026-09-24T10:00:00.000Z');
const user: UserRow = {
  id: '01923456-789a-7bcd-8ef0-123456789abc',
  email: null,
  displayName: 'Local creator',
  locale: Locale.En,
  isLocal: true,
  createdAt: now,
  updatedAt: now,
};

describe('repository helpers', () => {
  it('T1: toUser serializes dates as ISO strings', () => {
    expect(toUser(user)).toEqual({ ...user, createdAt: now.toISOString(), updatedAt: now.toISOString() });
  });

  it('T1: default settings use the spec defaults', () => {
    const settings = toUserSettings(defaultSettingsRow(user.id, now));
    expect(settings).toEqual({
      defaultVoiceId: null,
      defaultRate: 1,
      theme: Theme.Dark,
      reducedMotion: false,
      commandAliases: {},
      matchThresholds: DEFAULT_MATCH_THRESHOLDS,
      updatedAt: now.toISOString(),
    });
  });

  it('T1: applyUserPatch changes only the given fields', () => {
    expect(applyUserPatch(user, { displayName: 'Ada' })).toEqual({ ...user, displayName: 'Ada' });
    expect(applyUserPatch(user, { email: 'ada@example.com' }).displayName).toBe('Local creator');
    expect(applyUserPatch(user, {})).toEqual(user);
  });

  it('T1: applySettingsPatch keeps untouched fields and replaces nested objects whole', () => {
    const base = { ...defaultSettingsRow(user.id, now), commandAliases: { [Intent.Next]: ['onward'] } };
    const patched = applySettingsPatch(base, {
      theme: Theme.Light,
      commandAliases: { [Intent.Pause]: ['hang on'] },
    });
    expect(patched.theme).toBe(Theme.Light);
    expect(patched.defaultRate).toBe(1);
    expect(patched.commandAliases).toEqual({ [Intent.Pause]: ['hang on'] });
  });

  it('T1: a null defaultVoiceId clears the voice', () => {
    const base = { ...defaultSettingsRow(user.id, now), defaultVoiceId: 'af_heart' };
    expect(applySettingsPatch(base, { defaultVoiceId: null }).defaultVoiceId).toBeNull();
  });
});
