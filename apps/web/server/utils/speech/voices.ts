import { SpeechProvider, type SpeechVoice } from '@repo/contracts';

// Voices per provider (SPEC.md §B12). OpenAI's list is fixed; local voices come from the AI service.

const OPENAI_VOICE_IDS = ['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse'] as const;

export const OPENAI_VOICES: readonly SpeechVoice[] = OPENAI_VOICE_IDS.map((voiceId) => ({
  provider: SpeechProvider.OpenAi,
  voiceId,
  label: voiceId.charAt(0).toUpperCase() + voiceId.slice(1),
}));

const OPENAI_IDS = new Set<string>(OPENAI_VOICE_IDS);

/** The voice measured in Task 10a, and Kokoro's default (Task 7). */
export const DEFAULT_VOICE: Record<SpeechProvider, string> = {
  [SpeechProvider.OpenAi]: 'alloy',
  [SpeechProvider.Local]: 'af_heart',
};

/**
 * The voice to use with a provider: the requested one when that provider has it, else its default. A voice of
 * the other provider (e.g. the user's OpenAI voice during a local fallback) falls back to the default.
 */
export const resolveVoice: Record<SpeechProvider, (voiceId: string | null) => string> = {
  [SpeechProvider.OpenAi]: (voiceId) => (voiceId !== null && OPENAI_IDS.has(voiceId) ? voiceId : DEFAULT_VOICE[SpeechProvider.OpenAi]),
  [SpeechProvider.Local]: (voiceId) => (voiceId !== null && !OPENAI_IDS.has(voiceId) ? voiceId : DEFAULT_VOICE[SpeechProvider.Local]),
};
