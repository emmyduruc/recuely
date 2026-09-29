import { type ApiError, ApiErrorCode, ContractType, MediaType } from '@repo/contracts';
import { componentRef, contractExample } from './contract-schemas';
import { exampleNotFoundError, exampleValidationError } from './examples';
import { BODY_ERRORS, DB_ERRORS, error } from './paths';
import { ApiTag } from './tags';
import {
  JSON_MEDIA_TYPE,
  type MediaTypeObject,
  type OperationObject,
  type ParameterObject,
  type PathItemObject,
  type ResponseObject,
} from './types';

// Task 10 operations (SPEC.md §B12): speech through Nitro.

const apiError = (statusCode: number, code: ApiErrorCode, message: string, details?: ApiError['details']): ApiError => ({
  statusCode,
  code,
  message,
  ...(details === undefined ? {} : { details }),
});

const json = (description: string, type: ContractType): ResponseObject => ({
  description,
  content: { [JSON_MEDIA_TYPE]: { schema: componentRef(type), example: contractExample(type) } },
});

const speechUnavailable = (what: string): ResponseObject =>
  error(
    `No provider could ${what}: OpenAI isn't allowed (no consent or key) or failed twice, and the local AI service failed or is down. ` +
      '`details` names each provider and why (e.g. `timeout`, `stalled`, `unavailable`). Also returned when the database is down.',
    apiError(503, ApiErrorCode.SpeechUnavailable, `No speech provider could ${what}.`, [
      { field: 'openai', issue: 'stalled' },
      { field: 'local', issue: 'unavailable' },
    ]),
  );

const AUDIO_TYPES = ['audio/mpeg', MediaType.AudioWav] as const;
const TAKE_TYPES = Object.values(MediaType);

const binary = (type: string, description: string): MediaTypeObject => ({ schema: { type: 'string', contentMediaType: type, description } });

const audioContent: Record<string, MediaTypeObject> = Object.fromEntries(
  AUDIO_TYPES.map((type) => [type, binary(type, `Audio bytes (${type}).`)]),
);

const idQuery = (name: string, description: string, example: string | number, integer = false): ParameterObject => ({
  name,
  in: 'query',
  required: false,
  description,
  schema: integer ? { type: 'integer', minimum: 0, description: 'Non-negative integer.' } : { type: 'string', minLength: 1, description: 'Opaque id.' },
  example,
});

const operations: Record<string, OperationObject> = {
  synthesizeSpeech: {
    tags: [ApiTag.Speech],
    operationId: 'synthesizeSpeech',
    summary: 'Synthesize a chunk (cached)',
    description:
      'Returns audio for the text, verbatim. Served from the cache when the same provider, model, voice, rate and ' +
      'text were synthesized before (`cached: true`, no upstream call). Otherwise OpenAI `gpt-4o-mini-tts` is used ' +
      'only if the user consented to cloud speech and OPENAI_API_KEY is set: first byte within 2 s, no stall over ' +
      '2 s, one retry. Then the local AI service. The cloud voice has no word timings (chunk highlight); the local ' +
      'voice may have them. `voiceId`/`rate` default to the user settings.',
    requestBody: {
      required: true,
      description: 'The chunk text and optional voice and rate.',
      content: { [JSON_MEDIA_TYPE]: { schema: componentRef(ContractType.TtsRequest), example: contractExample(ContractType.TtsRequest) } },
    },
    responses: {
      200: json('The audio location and metadata.', ContractType.SpeechTtsResult),
      ...BODY_ERRORS,
      500: DB_ERRORS[500],
      503: speechUnavailable('synthesize this text'),
    },
  },
  getSpeechAudio: {
    tags: [ApiTag.Speech],
    operationId: 'getSpeechAudio',
    summary: 'Download cached speech audio',
    description: 'Streams a clip produced by `synthesizeSpeech`. A single `Range` request gets 206. Read-only; clips are write-once.',
    parameters: [
      {
        name: 'key',
        in: 'path',
        required: true,
        description: 'The `cacheKey` returned by `synthesizeSpeech`.',
        schema: { type: 'string', pattern: '^[a-f0-9]{32}$', description: '32 hex characters.' },
        example: '3f9c2a0d1e4b5c6a7f8e9d0c1b2a3f4e',
      },
      {
        name: 'Range',
        in: 'header',
        required: false,
        description: 'Optional single byte range, e.g. `bytes=0-1023`.',
        schema: { type: 'string', description: 'RFC 9110 byte range.' },
        example: 'bytes=0-1023',
      },
    ],
    responses: {
      200: { description: 'The whole clip.', content: audioContent },
      206: { description: 'The requested range.', content: audioContent },
      404: error('No cached clip with this key.', { ...exampleNotFoundError, message: 'No cached audio with this key.' }),
      416: error('The range is outside the clip.', apiError(416, ApiErrorCode.RangeNotSatisfiable, 'The requested range is outside the file.')),
    },
  },
  transcribeTake: {
    tags: [ApiTag.Speech],
    operationId: 'transcribeTake',
    summary: 'Transcribe a take',
    description:
      'Send the raw audio (≤ 25 MB) with its Content-Type. OpenAI `gpt-transcribe` is used only with consent and a ' +
      'key (English, never prompted with the chunk text; 4 s per attempt, one retry), otherwise the local AI service. ' +
      '`sessionId`, `chunkId` and `seq` are echoed so the engine can drop stale results (SPEC.md §B6).',
    parameters: [
      idQuery('sessionId', 'Session the take belongs to (echoed).', '0192a1b2-c3d4-7e5f-8a6b-000000000004'),
      idQuery('chunkId', 'Chunk the take belongs to (echoed).', '0192a1b2-c3d4-7e5f-8a6b-00000000000c'),
      idQuery('seq', 'Engine sequence number (echoed).', 4, true),
    ],
    requestBody: {
      required: true,
      description: 'The take audio.',
      content: Object.fromEntries(TAKE_TYPES.map((type) => [type, binary(type, `Raw audio/video bytes (${type}).`)])),
    },
    responses: {
      200: json('The transcript, with the provider and echoed ids.', ContractType.SpeechSttResult),
      413: error('The body is larger than 25 MB.', apiError(413, ApiErrorCode.PayloadTooLarge, 'Takes sent for transcription must be at most 25 MB.')),
      415: error('Unsupported Content-Type.', apiError(415, ApiErrorCode.UnsupportedMediaType, 'Send the take as audio/wav, audio/webm, audio/mp4, audio/ogg, video/webm or video/mp4.')),
      422: error('Empty body or an invalid `seq`.', { ...exampleValidationError, details: [{ field: 'seq', issue: 'must be a non-negative integer' }] }),
      500: DB_ERRORS[500],
      503: speechUnavailable('transcribe this take'),
    },
  },
  listSpeechVoices: {
    tags: [ApiTag.Speech],
    operationId: 'listSpeechVoices',
    summary: 'List voices',
    description: "OpenAI's voices when OPENAI_API_KEY is set, plus the local AI service's voices when it's reachable. Read-only.",
    responses: {
      200: {
        description: 'The voices.',
        content: {
          [JSON_MEDIA_TYPE]: {
            schema: { type: 'array', items: componentRef(ContractType.SpeechVoice) },
            example: [contractExample(ContractType.SpeechVoice)],
          },
        },
      },
      500: error('An unexpected error occurred.', apiError(500, ApiErrorCode.Internal, 'Something went wrong on the server.')),
    },
  },
};

function op(name: string): OperationObject {
  const operation = operations[name];
  if (operation === undefined) throw new Error(`Unknown operation ${name}`);
  return operation;
}

export const SPEECH_PATHS: Readonly<Record<string, PathItemObject>> = {
  '/api/speech/tts': { post: op('synthesizeSpeech') },
  '/api/speech/audio/{key}': { get: op('getSpeechAudio') },
  '/api/speech/stt': { post: op('transcribeTake') },
  '/api/speech/voices': { get: op('listSpeechVoices') },
};
