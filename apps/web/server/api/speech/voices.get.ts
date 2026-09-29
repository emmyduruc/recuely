import type { SpeechVoice } from '@repo/contracts';
import { defineApiHandler } from '../../utils/api-handler';
import { useSpeechConfig } from '../../utils/speech/config';
import { localVoices } from '../../utils/speech/local';
import { OPENAI_VOICES } from '../../utils/speech/voices';

/** Voices of both providers: OpenAI's when a key is configured, the local service's when it's reachable. */
export default defineApiHandler(async (): Promise<SpeechVoice[]> => {
  const config = useSpeechConfig();
  return [...(config.openAiKey === null ? [] : OPENAI_VOICES), ...(await localVoices(config))];
});
