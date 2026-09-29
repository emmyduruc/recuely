import { TimingSource } from '../payloads.ts';
import {
  type SpeechSttResult,
  SpeechLimits,
  SpeechProvider,
  type SpeechTtsResult,
  type SpeechVoice,
  type SttTranscript,
  type TtsRequest,
} from '../speech.ts';
import { UserLimits } from '../user.ts';
import { enumOf, nonNegativeInt, ref, text } from './helpers.ts';
import { type JsonSchema, objectSchema } from './json-schema.ts';

// Task 10 contracts: speech through Nitro (OpenAI after consent, else local) and the local AI service (§B12).

const rate: JsonSchema = {
  type: 'number',
  minimum: UserLimits.rateMin,
  maximum: UserLimits.rateMax,
  description: 'Speech rate multiplier; defaults to the user setting.',
};
const voiceId = text(SpeechLimits.voiceIdMax, "The provider's voice id; defaults to the user setting or the provider default.");
const echoed = {
  sessionId: { type: 'string', minLength: 1, description: 'Echoed from the request.' },
  chunkId: { type: 'string', minLength: 1, description: 'Echoed from the request.' },
  seq: nonNegativeInt('Echoed from the request; stale results (lower seq) are dropped (§B6).'),
} as const satisfies Record<string, JsonSchema>;

const ttsResultProperties = {
  audioUrl: { type: 'string', minLength: 1, description: 'Where to fetch the audio.' },
  durationMs: { type: 'number', minimum: 0, description: 'Audio duration in ms.' },
  timings: { type: ['array', 'null'], items: ref('WordTiming'), description: 'Word timings, or null (chunk highlight).' },
  timingSource: { type: 'string', enum: Object.values(TimingSource), description: 'Origin of the timings.' },
  cacheKey: { type: 'string', minLength: 1, description: 'Key of the cached audio.' },
} as const satisfies Record<string, JsonSchema>;

const exampleTts: SpeechTtsResult = {
  audioUrl: '/api/speech/audio/3f9c2a',
  durationMs: 2160,
  timings: null,
  timingSource: TimingSource.None,
  cacheKey: '3f9c2a',
  provider: SpeechProvider.OpenAi,
  voiceId: 'alloy',
  cached: false,
};

export const SPEECH_SCHEMAS = {
  TtsRequest: objectSchema<TtsRequest>()({
    type: 'object',
    description: 'POST /api/speech/tts (and /v0/tts) body. Unknown fields are rejected.',
    properties: { text: text(SpeechLimits.textMax, 'The chunk text to read, verbatim.'), voiceId, rate },
    required: ['text'],
    additionalProperties: false,
    examples: [{ text: 'Welcome back, everyone.', voiceId: 'alloy', rate: 1 }],
  }),
  SpeechTtsResult: objectSchema<SpeechTtsResult>()({
    type: 'object',
    description:
      'Synthesized audio for one chunk. The cloud voice has no word timings (chunk highlight, §B12); the local ' +
      'voice may have them. `timings` is null exactly when `timingSource` is `none`.',
    properties: {
      ...ttsResultProperties,
      provider: enumOf(SpeechProvider, 'Who synthesized it.'),
      voiceId: { type: 'string', minLength: 1, description: 'The voice used.' },
      cached: { type: 'boolean', description: 'Served from the cache without an upstream call.' },
    },
    required: ['audioUrl', 'durationMs', 'timings', 'timingSource', 'cacheKey', 'provider', 'voiceId', 'cached'],
    additionalProperties: true,
    examples: [exampleTts],
  }),
  SttTranscript: objectSchema<SttTranscript>()({
    type: 'object',
    description: 'Transcript of one take (local AI service). Ids from the request are echoed.',
    properties: {
      text: { type: 'string', description: 'What was said; empty for silence or noise.' },
      durationMs: { type: 'number', minimum: 0, description: 'Audio duration in ms.' },
      model: { type: 'string', minLength: 1, description: 'Model that transcribed it.' },
      ...echoed,
    },
    required: ['text', 'durationMs', 'model'],
    additionalProperties: true,
    examples: [{ text: 'Welcome back, everyone.', durationMs: 2400, model: 'base.en', chunkId: 'c1', seq: 4 }],
  }),
  SpeechSttResult: objectSchema<SpeechSttResult>()({
    type: 'object',
    description: 'Transcript of one take, with the provider that produced it.',
    properties: {
      text: { type: 'string', description: 'What was said; empty for silence or noise.' },
      durationMs: { type: 'number', minimum: 0, description: 'Audio duration in ms (0 when unknown).' },
      model: { type: 'string', minLength: 1, description: 'Model that transcribed it.' },
      ...echoed,
      provider: enumOf(SpeechProvider, 'Who transcribed it.'),
    },
    required: ['text', 'durationMs', 'model', 'provider'],
    additionalProperties: true,
    examples: [{ text: 'Welcome back, everyone.', durationMs: 0, model: 'gpt-transcribe', provider: SpeechProvider.OpenAi, chunkId: 'c1', seq: 4 }],
  }),
  SpeechVoice: objectSchema<SpeechVoice>()({
    type: 'object',
    description: 'A voice a provider offers.',
    properties: {
      provider: enumOf(SpeechProvider, 'Who offers the voice.'),
      voiceId: { type: 'string', minLength: 1, description: "The provider's voice id." },
      label: { type: 'string', minLength: 1, description: 'Name shown in the picker.' },
    },
    required: ['provider', 'voiceId', 'label'],
    additionalProperties: true,
    examples: [{ provider: SpeechProvider.OpenAi, voiceId: 'alloy', label: 'Alloy' }],
  }),
} as const satisfies Record<string, JsonSchema>;
