// Task 10a spike (throwaway): derive word timings for OpenAI TTS audio by transcribing it with word timestamps
// and aligning the heard words to the chunk's words with the app's matcher (Task 6). Checks the start times
// against the waveform like Task 7 (every internal silence ≥ 60 ms must end where a word starts).
// `node align.ts [sttModel]` → results/align-<sttModel>.json
import { readFileSync } from 'node:fs';
import { alignWords, matchTokens, wordsIn } from '../../packages/script-model/src/index.ts';
import { ALIGN_LINES, median, round, save, wavInfo } from './common.ts';
import { transcribe } from './stt.ts';

const TTS_MODELS = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'];
const STT = process.argv[2] ?? 'whisper-1';

interface HeardWord {
  word: string;
  start: number;
  end: number;
}

/** Quiet regions (10 ms frames, 40 dB below the peak) lasting ≥ 60 ms, as in Task 7. */
function silentGaps(wav: Buffer, minMs = 60, floorDb = -40): [number, number][] {
  const { sampleRate, dataOffset, seconds } = wavInfo(wav);
  const samples = Math.floor(seconds * sampleRate);
  const frame = Math.floor(sampleRate * 0.01);
  const rms: number[] = [];
  for (let f = 0; f + 1 <= samples / frame; f += 1) {
    let sum = 0;
    for (let i = 0; i < frame; i += 1) {
      const v = wav.readInt16LE(dataOffset + 2 * (f * frame + i)) / 32768;
      sum += v * v;
    }
    rms.push(Math.sqrt(sum / frame + 1e-12));
  }
  const peak = Math.max(...rms);
  const gaps: [number, number][] = [];
  let start: number | null = null;
  rms.forEach((value, i) => {
    const quiet = 20 * Math.log10(value / peak) < floorDb;
    if (quiet && start === null) start = i;
    if (!quiet && start !== null) {
      if ((i - start) * 10 >= minMs) gaps.push([start / 100, i / 100]);
      start = null;
    }
  });
  return gaps;
}

/** Start time per script word (whitespace-separated, as the UI renders them); null when it can't be timed. */
function scriptWordStarts(chunk: string, heard: HeardWord[]): { word: string; start: number | null; speakable: boolean }[] {
  const chunkTokens = matchTokens(chunk);
  const heardTokens = heard.flatMap((word, index) => matchTokens(word.word).map((token) => ({ text: token.text, index })));
  const pairs = alignWords(chunkTokens.map((t) => t.text), heardTokens.map((t) => t.text));
  const tokenStart = new Map(pairs.map(([i, j]) => [i, heard[heardTokens[j]?.index ?? -1]?.start ?? null]));
  return wordsIn(chunk).map((span) => {
    const tokens = chunkTokens.map((t, i) => ({ t, i })).filter(({ t }) => t.start >= span.start && t.end <= span.end);
    const starts = tokens.map(({ i }) => tokenStart.get(i)).filter((s): s is number => typeof s === 'number');
    return { word: chunk.slice(span.start, span.end), start: starts.length > 0 ? Math.min(...starts) : null, speakable: tokens.length > 0 };
  });
}

const report = [];
for (const tts of TTS_MODELS) {
  const rows = [];
  for (const [index, chunk] of ALIGN_LINES.entries()) {
    const wav = readFileSync(new URL(`audio/${tts}/${String(index)}.wav`, import.meta.url));
    const r = await transcribe(STT, wav, { response_format: 'verbose_json', 'timestamp_granularities[]': 'word' });
    const body = r.body as { words?: HeardWord[]; text?: string; error?: { message: string } };
    if (body.error !== undefined) {
      console.log(STT, 'refused word timestamps:', body.error.message);
      process.exit(0);
    }
    const heard = body.words ?? [];
    const words = scriptWordStarts(chunk, heard);
    const speakable = words.filter((w) => w.speakable);
    const timed = speakable.filter((w) => w.start !== null);
    const starts = timed.map((w) => w.start ?? 0);
    const monotonic = starts.every((s, i) => i === 0 || s >= (starts[i - 1] ?? 0));
    const seconds = wavInfo(wav).seconds;
    const gaps = silentGaps(wav).filter(([a, b]) => a > 0.05 && b < seconds - 0.05);
    // Signed: word start minus the end of the silence before it (negative = highlight comes early).
    const signedMs = gaps.map(([, end]) => {
      const nearest = starts.reduce((best, s) => (Math.abs(s - end) < Math.abs(best - end) ? s : best), Number.POSITIVE_INFINITY);
      return (nearest - end) * 1000;
    });
    const errorsMs = signedMs.map(Math.abs);
    rows.push({
      chunk,
      transcript: body.text,
      speakableWords: speakable.length,
      timedWords: timed.length,
      fullyAligned: timed.length === speakable.length && monotonic,
      untimed: speakable.filter((w) => w.start === null).map((w) => w.word),
      gapsChecked: gaps.length,
      startErrorsMs: errorsMs.map((e) => round(e, 1)),
      signedErrorsMs: signedMs.map((e) => round(e, 1)),
      heard,
      latency_s: round(r.latency),
      audio_s: round(seconds, 2),
    });
  }
  const errors = rows.flatMap((r) => r.startErrorsMs);
  const summary = {
    tts,
    stt: STT,
    chunks: rows.length,
    fullyAligned: rows.filter((r) => r.fullyAligned).length,
    wordsTimed: `${String(rows.reduce((s, r) => s + r.timedWords, 0))}/${String(rows.reduce((s, r) => s + r.speakableWords, 0))}`,
    gapsChecked: errors.length,
    startErrorMedianMs: round(median(errors), 1),
    startErrorMaxMs: errors.length > 0 ? round(Math.max(...errors), 1) : null,
    within50ms: `${String(errors.filter((e) => e <= 50).length)}/${String(errors.length)}`,
    signedMedianMs: round(median(rows.flatMap((r) => r.signedErrorsMs)), 1),
    early: rows.flatMap((r) => r.signedErrorsMs).filter((e) => e < 0).length,
    alignLatencyMedianS: round(median(rows.map((r) => r.latency_s))),
    notAligned: rows.filter((r) => !r.fullyAligned).map((r) => ({ chunk: r.chunk, untimed: r.untimed })),
  };
  console.log(JSON.stringify(summary));
  report.push({ summary, rows });
}
save(`align-${STT}.json`, report);
