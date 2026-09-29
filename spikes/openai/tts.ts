// Task 10a spike (throwaway): OpenAI TTS latency (first byte / full audio), speed control, and WAV outputs for
// the alignment step. `node tts.ts` → results/tts.json, audio/<model>/<n>.wav
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALIGN_LINES, median, round, save, speech, TEXTS, wavInfo } from './common.ts';

const MODELS = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'];
const VOICE = 'alloy';
const RUNS = 3;

const latency = [];
for (const model of MODELS) {
  for (const format of ['mp3', 'wav'] as const) {
    for (const [name, input] of Object.entries(TEXTS)) {
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) {
        const r = await speech({ model, input, voice: VOICE, response_format: format });
        if (r.error !== undefined) throw new Error(`${model} ${String(r.status)}: ${r.error}`);
        runs.push({ ttfb: r.ttfb, total: r.total, bytes: r.audio.length, seconds: format === 'wav' ? wavInfo(r.audio).seconds : null });
      }
      const row = {
        model,
        format,
        text: name,
        chars: input.length,
        ttfb_median_s: round(median(runs.map((r) => r.ttfb))),
        ttfb_max_s: round(Math.max(...runs.map((r) => r.ttfb))),
        total_median_s: round(median(runs.map((r) => r.total))),
        audio_s: runs[0]?.seconds === null ? null : round(runs[0]?.seconds ?? 0, 2),
        runs,
      };
      console.log(model, format, name, 'ttfb', row.ttfb_median_s, 'total', row.total_median_s, 'audio', row.audio_s);
      latency.push(row);
    }
  }
}

// Speed control (§B7 default_rate 0.5–2): does `speed` change the duration?
const speedCheck = [];
for (const model of MODELS) {
  const durations: Record<string, number> = {};
  for (const speed of [1, 1.5]) {
    const r = await speech({ model, input: TEXTS.medium ?? '', voice: VOICE, response_format: 'wav', speed });
    durations[String(speed)] = r.error === undefined ? round(wavInfo(r.audio).seconds, 2) : -1;
  }
  console.log('speed', model, durations);
  speedCheck.push({ model, durations });
}

// WAV per alignment line and model, for align.ts.
for (const model of MODELS) {
  mkdirSync(new URL(`audio/${model}/`, import.meta.url), { recursive: true });
  for (const [index, input] of ALIGN_LINES.entries()) {
    const r = await speech({ model, input, voice: VOICE, response_format: 'wav' });
    if (r.error !== undefined) throw new Error(r.error);
    writeFileSync(new URL(`audio/${model}/${String(index)}.wav`, import.meta.url), r.audio);
  }
  console.log('saved alignment audio for', model);
}

save('tts.json', { date: new Date().toISOString(), voice: VOICE, latency, speedCheck });
