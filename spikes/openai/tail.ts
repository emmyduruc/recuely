// Task 10a spike (throwaway): tail latency of gpt-4o-mini-tts (mp3, the format the app would stream).
import { round, save, speech, TEXTS } from './common.ts';

const N = 20;
const ttfb: number[] = [];
const failures: string[] = [];
const texts = Object.values(TEXTS);
for (let i = 0; i < N; i += 1) {
  const r = await speech({ model: 'gpt-4o-mini-tts', input: texts[i % texts.length] ?? '', voice: 'alloy', response_format: 'mp3' });
  if (r.error !== undefined) {
    failures.push(`${String(i)}: ${String(r.status)} after ${String(round(r.total))} s: ${r.error.slice(0, 120)}`);
    console.log('failure', failures.at(-1));
    continue;
  }
  ttfb.push(round(r.ttfb));
  console.log(i, round(r.ttfb), round(r.total));
}
const sorted = [...ttfb].sort((a, b) => a - b);
const summary = { n: N, failures: failures.length, p50: sorted[Math.floor(sorted.length / 2)], p90: sorted[Math.floor(sorted.length * 0.9)], max: sorted.at(-1), over4s: ttfb.filter((t) => t > 4).length, over1_2s: ttfb.filter((t) => t > 1.2).length };
console.log(summary);
save('tts-tail.json', { summary, ttfb, failures });
