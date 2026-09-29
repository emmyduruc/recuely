import { getOrCreateSettings } from '@repo/db';
import { useLocalUser } from '../local-user';
import { useMediaStorage } from '../storage';
import { useSpeechConfig } from './config';
import type { SpeechContext } from './service';

/** Config, storage and the local user's speech settings (consent, default voice and rate). */
export async function useSpeechContext(): Promise<SpeechContext> {
  const { ds, user } = await useLocalUser();
  const settings = await getOrCreateSettings(ds, user.id);
  return {
    config: useSpeechConfig(),
    storage: useMediaStorage().instance,
    settings: {
      cloudSpeechConsentAt: settings.cloudSpeechConsentAt,
      defaultVoiceId: settings.defaultVoiceId,
      defaultRate: settings.defaultRate,
    },
  };
}
