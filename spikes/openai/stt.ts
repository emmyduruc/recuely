// Task 10a spike (throwaway): OpenAI STT on the Task 8 fixtures, never prompted with the chunk text (Task 8
// finding H-15). Writes ../stt/results/stt-openai-<model>.json in the Task 8 format, scored by ../stt/score.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { API, auth, round } from './common.ts';

const MODELS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'gpt-transcribe'];
const AUDIO = new URL('../stt/audio/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', AUDIO), 'utf8')) as { file: string; seconds: number }[];

export async function transcribe(model: string, wav: Buffer, extra: Record<string, string> = {}): Promise<{ status: number; body: unknown; latency: number }> {
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'take.wav');
  form.append('model', model);
  form.append('language', 'en');
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  const started = performance.now();
  const response = await fetch(`${API}/audio/transcriptions`, { method: 'POST', headers: auth, body: form });
  const body: unknown = await response.json();
  return { status: response.status, body, latency: (performance.now() - started) / 1000 };
}

if (import.meta.main) {
  for (const model of MODELS) {
    const rows = [];
    let usage = { seconds: 0, inputTokens: 0, outputTokens: 0 };
    for (const clip of manifest) {
      const r = await transcribe(model, readFileSync(new URL(clip.file, AUDIO)));
      const body = r.body as { text?: string; error?: { message: string }; usage?: { type?: string; seconds?: number; input_tokens?: number; output_tokens?: number } };
      if (body.error !== undefined) {
        console.log(model, clip.file, r.status, body.error.message);
        break;
      }
      usage = {
        seconds: usage.seconds + (body.usage?.seconds ?? clip.seconds),
        inputTokens: usage.inputTokens + (body.usage?.input_tokens ?? 0),
        outputTokens: usage.outputTokens + (body.usage?.output_tokens ?? 0),
      };
      rows.push({ ...clip, biased: false, transcript: (body.text ?? '').trim(), latency_s: round(r.latency) });
    }
    if (rows.length === manifest.length) {
      writeFileSync(
        new URL(`../stt/results/stt-openai-${model}.json`, import.meta.url),
        JSON.stringify({ model: `openai:${model}`, beam: 0, load_s: 0, peak_rss_mb: 0, usage, rows }, null, 1),
      );
      console.log(model, 'done; median latency', round(rows.map((r) => r.latency_s).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0), 'usage', usage);
    }
  }
}
