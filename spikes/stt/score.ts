// Task 8 spike (throwaway): scores results/stt-*.json with the app's own matcher (Task 6) and normalizer.
// `node score.ts` prints a summary per model and writes results/summary.json.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_MATCH_THRESHOLDS, MatchDecision } from '../../packages/contracts/src/index.ts';
import { alignWords, matchTranscript, matchWords } from '../../packages/script-model/src/index.ts';

interface Row {
  file: string;
  condition: string;
  chunk: string | null;
  reference: string;
  expect: string | null;
  biased: boolean;
  transcript: string;
  latency_s: number;
  seconds: number;
}

interface Run {
  model: string;
  beam: number;
  load_s: number;
  peak_rss_mb: number;
  rows: Row[];
}

function wer(reference: string, hypothesis: string): number {
  const ref = matchWords(reference);
  const hyp = matchWords(hypothesis);
  if (ref.length === 0) {
    return hyp.length === 0 ? 0 : 1;
  }
  // Word-level Levenshtein.
  let previous = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= hyp.length; j += 1) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost));
    }
    previous = current;
  }
  return (previous[hyp.length] ?? 0) / ref.length;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};
const round = (value: number, digits = 3): number => Math.round(value * 10 ** digits) / 10 ** digits;

const runs = readdirSync(new URL('results/', import.meta.url))
  .filter((file) => file.startsWith('stt-') && file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(new URL(`results/${file}`, import.meta.url), 'utf8')) as Run);

const summary = runs.map((run) => {
  const scored = run.rows
    .filter((row) => row.chunk !== null)
    .map((row) => {
      const result = matchTranscript(row.chunk ?? '', row.transcript, DEFAULT_MATCH_THRESHOLDS);
      // Did the prompt make Whisper "hear" chunk words that were never spoken? (H-15)
      const spoken = matchWords(row.reference);
      const chunkWords = matchWords(row.chunk ?? '');
      const heard = matchWords(row.transcript);
      const invented = heard.filter((word) => chunkWords.includes(word) && !spoken.includes(word)).length;
      return { ...row, decision: result.decision, coverage: result.coverage, wer: wer(row.reference, row.transcript), invented, aligned: alignWords(chunkWords, heard).length };
    });
  const by = (biased: boolean) => {
    const rows = scored.filter((row) => row.biased === biased);
    const expectAsk = rows.filter((row) => row.expect === MatchDecision.Ask);
    const expectAdvance = rows.filter((row) => row.expect === MatchDecision.Advance);
    const conditions = [...new Set(rows.map((row) => row.condition))];
    return {
      falseAdvances: expectAsk.filter((row) => row.decision === MatchDecision.Advance).map((row) => row.file),
      falseAsks: expectAdvance.filter((row) => row.decision === MatchDecision.Ask).map((row) => `${row.file}: "${row.transcript}"`),
      inventedWords: rows.reduce((sum, row) => sum + row.invented, 0),
      byCondition: Object.fromEntries(
        conditions.map((condition) => {
          const group = rows.filter((row) => row.condition === condition);
          return [condition, {
            werMedian: round(median(group.map((row) => row.wer))),
            werMax: round(Math.max(...group.map((row) => row.wer))),
            advanced: `${String(group.filter((row) => row.decision === MatchDecision.Advance).length)}/${String(group.length)}`,
          }];
        }),
      ),
    };
  };
  const latency = scored.filter((row) => !row.biased);
  const fiveSecond = latency.filter((row) => row.seconds >= 4 && row.seconds <= 6.5);
  return {
    model: run.model,
    beam: run.beam,
    load_s: run.load_s,
    peak_rss_mb: run.peak_rss_mb,
    latencyMedian_s: round(median(latency.map((row) => row.latency_s)), 2),
    latencyMax_s: round(Math.max(...latency.map((row) => row.latency_s)), 2),
    latency5sTake_s: round(median(fiveSecond.map((row) => row.latency_s)), 2),
    fiveSecondClips: fiveSecond.length,
    rtfMedian: round(median(latency.map((row) => row.latency_s / row.seconds)), 2),
    unbiased: by(false),
    biased: by(true),
    silentClips: run.rows.filter((row) => row.chunk === null).map((row) => ({ file: row.file, biased: row.biased, transcript: row.transcript })),
  };
});

writeFileSync(new URL('results/summary.json', import.meta.url), JSON.stringify(summary, null, 1));
for (const s of summary) {
  console.log(`\n== ${s.model} beam ${String(s.beam)}: load ${String(s.load_s)} s, RSS ${String(s.peak_rss_mb)} MB, latency median ${String(s.latencyMedian_s)} s (5 s takes: ${String(s.latency5sTake_s)} s over ${String(s.fiveSecondClips)} clips), max ${String(s.latencyMax_s)} s, RTF ${String(s.rtfMedian)}`);
  for (const mode of ['unbiased', 'biased'] as const) {
    const m = s[mode];
    console.log(`  ${mode}: false advances ${String(m.falseAdvances.length)} ${JSON.stringify(m.falseAdvances)}, false asks ${String(m.falseAsks.length)}, invented chunk words ${String(m.inventedWords)}`);
    console.log(`    ${JSON.stringify(m.byCondition)}`);
    if (m.falseAsks.length > 0) {
      console.log(`    false asks: ${m.falseAsks.join(' | ')}`);
    }
  }
  console.log(`  silent clips: ${JSON.stringify(s.silentClips)}`);
}
