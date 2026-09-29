// Fake OpenAI and fake local AI service for the speech integration tests (SPEC.md Task 10). Behaviour is chosen
// per request by markers in the text (TTS) or the audio bytes (STT). Every call is recorded for the tests.
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mp3Frames } from '../speech/mp3-frames';

export const FAKE_OPENAI_KEY = 'sk-test-FAKE-KEY-never-leak-4242';
/** Frames in the fake mp3: 25 × 24 ms. */
export const FAKE_MP3_DURATION_MS = 600;

export const Marker = {
  StallFirstByte: '[stall-first]',
  StallMidStream: '[stall-mid]',
  Fail: '[fail]',
  Quota: '[quota]',
  Flaky: '[flaky]',
  EchoKey: '[echo-key]',
  LocalDown: '[local-down]',
  SttStall: 'FAKE-STT-STALL',
  SttLocalDown: 'FAKE-LOCAL-DOWN',
} as const;

export interface RecordedCall {
  service: string;
  method: string;
  path: string;
  authorized: boolean;
  body: Record<string, unknown>;
  hasPrompt?: boolean;
  fields?: Record<string, string>;
}

const OPENAI = 'openai';
const LOCAL = 'local';
const HTTP_OK = 200;

const FakePath = {
  Calls: '/__calls',
  Reset: '/__reset',
  Health: '/v0/health',
  Voices: '/v0/tts/voices',
  Tts: '/v0/tts',
  TtsAudio: '/v0/tts/audio/',
  Stt: '/v0/stt',
} as const;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

const hang = (res: ServerResponse, open: Set<ServerResponse>): void => {
  open.add(res);
};

/** Multipart form fields (text parts only) of an OpenAI transcription upload. */
function formFields(body: Buffer): Record<string, string> {
  const text = body.toString('latin1');
  return Object.fromEntries(
    [...text.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)\r\n/g)].map((match) => [match[1] ?? '', match[2] ?? '']),
  );
}

function wav(): Buffer {
  const data = Buffer.alloc(4800);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export interface FakeSpeech {
  openAiUrl: string;
  aiServiceUrl: string;
  close: () => Promise<void>;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

export async function startFakeSpeech(): Promise<FakeSpeech> {
  const calls: RecordedCall[] = [];
  const open = new Set<ServerResponse>();
  const seenFlaky = new Set<string>();

  const control = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (req.url === FakePath.Calls) {
      sendJson(res, HTTP_OK, calls);
      return true;
    }
    if (req.url === FakePath.Reset) {
      calls.length = 0;
      seenFlaky.clear();
      sendJson(res, HTTP_OK, { reset: true });
      return true;
    }
    return false;
  };

  const openAi = createServer((req, res) => {
    if (control(req, res)) return;
    void (async () => {
      const raw = await readBody(req);
      const authorized = req.headers.authorization === `Bearer ${FAKE_OPENAI_KEY}`;
      const path = req.url ?? '';
      if (path.endsWith('/audio/speech')) {
        const body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
        calls.push({ service: OPENAI, method: req.method ?? '', path, authorized, body });
        const input = String(body.input);
        if (!authorized || input.includes(Marker.EchoKey)) {
          sendJson(res, 401, { error: { message: `Incorrect API key provided: ${FAKE_OPENAI_KEY}.` } });
        } else if (input.includes(Marker.StallFirstByte) || (input.includes(Marker.Flaky) && !seenFlaky.has(input))) {
          seenFlaky.add(input);
          hang(res, open);
        } else if (input.includes(Marker.StallMidStream)) {
          res.writeHead(HTTP_OK, { 'content-type': 'audio/mpeg' });
          res.write(mp3Frames(5));
          hang(res, open);
        } else if (input.includes(Marker.Fail)) {
          sendJson(res, 500, { error: { message: 'boom' } });
        } else if (input.includes(Marker.Quota)) {
          sendJson(res, 429, { error: { message: 'rate limited' } });
        } else {
          res.writeHead(HTTP_OK, { 'content-type': 'audio/mpeg' }).end(mp3Frames(25));
        }
        return;
      }
      if (path.endsWith('/audio/transcriptions')) {
        const fields = formFields(raw);
        calls.push({ service: OPENAI, method: req.method ?? '', path, authorized, body: {}, hasPrompt: 'prompt' in fields, fields });
        if (raw.includes(Marker.SttStall)) {
          hang(res, open);
          return;
        }
        sendJson(res, HTTP_OK, { text: ' cloud transcript ', usage: { type: 'duration', seconds: 1.5 } });
        return;
      }
      sendJson(res, 404, { error: { message: 'unknown fake route' } });
    })();
  });

  const local = createServer((req, res) => {
    if (control(req, res)) return;
    void (async () => {
      const raw = await readBody(req);
      const url = new URL(req.url ?? '/', 'http://fake');
      calls.push({ service: LOCAL, method: req.method ?? '', path: url.pathname + url.search, authorized: true, body: {} });
      if (url.pathname === FakePath.Health) {
        sendJson(res, HTTP_OK, { v: '0.1', status: 'available', capabilities: { tts: { status: 'available' }, stt: { status: 'available' } } });
      } else if (url.pathname === FakePath.Voices) {
        sendJson(res, HTTP_OK, [{ provider: 'local', voiceId: 'af_heart', label: 'Heart' }, { provider: 'local', broken: true }]);
      } else if (url.pathname === FakePath.Tts) {
        const body = JSON.parse(raw.toString('utf8')) as { text: string };
        if (body.text.includes(Marker.LocalDown)) {
          sendJson(res, 503, { error: 'models not loaded' });
          return;
        }
        const key = createHash('sha256').update(raw).digest('hex').slice(0, 12);
        const firstWord = body.text.split(' ')[0] ?? '';
        sendJson(res, HTTP_OK, {
          audioUrl: `/v0/tts/audio/${key}`,
          durationMs: 100,
          timings: [{ index: 0, start: 0, end: 90, charStart: 0, charEnd: firstWord.length }],
          timingSource: 'provider',
          cacheKey: key,
        });
      } else if (url.pathname.startsWith(FakePath.TtsAudio)) {
        res.writeHead(HTTP_OK, { 'content-type': 'audio/wav' }).end(wav());
      } else if (url.pathname === FakePath.Stt) {
        if (raw.includes(Marker.SttLocalDown)) {
          sendJson(res, 503, { error: 'down' });
          return;
        }
        sendJson(res, HTTP_OK, { text: 'local transcript', durationMs: 1000, model: 'base.en', seq: 999 });
      } else {
        sendJson(res, 404, { error: 'unknown fake route' });
      }
    })();
  });

  const openAiUrl = `${await listen(openAi)}/v1`;
  const aiServiceUrl = await listen(local);
  return {
    openAiUrl,
    aiServiceUrl,
    close: async () => {
      for (const res of open) res.destroy();
      openAi.closeAllConnections();
      local.closeAllConnections();
      await Promise.all([new Promise((resolve) => openAi.close(resolve)), new Promise((resolve) => local.close(resolve))]);
    },
  };
}
