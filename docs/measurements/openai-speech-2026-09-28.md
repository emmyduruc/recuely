# OpenAI speech spike (Task 10a)

**Date:** 2026-09-28 · **Network:** home connection from this Mac (Germany) to `api.openai.com` ·
**Code:** `spikes/openai/` (throwaway; `node models.ts | tts.ts | tail.ts | stt.ts | align.ts`) · **Raw data:**
`spikes/openai/results/*.json`, `spikes/stt/results/stt-openai-*.json` (scored with the Task 8 scorer `spikes/stt/score.ts`,
which uses the app's own matcher). Audio outputs (`spikes/openai/audio/`) are gitignored.
**Inputs:** only synthetic material was sent: the spike's test sentences and the Task 8 synthetic takes. No user
script or recording left the machine.

## Recommendation

1. **TTS: `gpt-4o-mini-tts`, mp3, streamed through Nitro.**
   - It has the fastest first byte: median 0.77–0.90 s across chunk lengths, and p90 1.14 s over 20 more requests.
   - It honours `speed`, so the §B7 rate setting works.
   - Cost is about $0.015 per minute of audio.
2. **STT: `gpt-transcribe`**, with `gpt-4o-mini-transcribe` as a configurable cheaper option.
   - It makes the same match decisions as local `base.en` on every Task 8 fixture (0 false advances).
   - It has the tightest latency: p50 0.81 s, p90 1.01 s, max 1.34 s per 5 s take.
   - It returns nothing on noise, and costs $0.0045/min.
3. **Treat the cloud as unreliable. It is fast when it answers, but 15% of TTS requests stalled.**
   - 3 of 20 stalled for more than 30 s, one of them after the audio had started. Earlier, 2 of 9 wav requests took 11–15 s to the first byte.
   - Task 10 needs:
     - a first-byte timeout (§B7 4 s)
     - a stall timeout while streaming
     - one retry
     - prefetching of chunk N+1 (and N+2) while the creator records chunk N
     - the audio cache, so repeats and retakes cost nothing and start instantly
     - then the local fallback
4. **Word highlighting from derived timings is not precise enough (H-29 refuted).**
   - Only `whisper-1` returns word timestamps. The `gpt-*-transcribe` models reject `verbose_json`.
   - Aligning its words to the chunk works: 12–13 of 14 chunks fully timed, 141–142 of 143 words.
   - But the start times are a median 90–100 ms off the audio, up to 560 ms, in both directions, so there's no offset to correct.
   - Only 25–36% of checks land within the 50 ms bar that Kokoro met (Task 7: median 38 ms, max 40 ms).
   - **Decision needed:** see "Word highlighting options" below.
5. **Cost is small:**
   - about $0.02–0.04 per 60-s script
   - about $0.25–0.40 per 45-min session (list prices; assumptions below)
6. **Privacy facts** for the §A6.8 consent text are below, with sources.

## TTS latency

Voice `alloy`, median of 3 runs per cell. TTFB = time to the first audio byte; total = full response.

| Model | Format | Short (38 chars) TTFB / total | Medium (69) | Long (134) | Speed 1 → 1.5 (medium) |
|---|---|---|---|---|---|
| **gpt-4o-mini-tts** | **mp3** | **0.85 / 1.17 s** | **0.90 / 1.34 s** | **0.77 / 1.50 s** | 5.60 → 3.42 s ✓ |
| gpt-4o-mini-tts | wav | 1.15 / 1.96 s (max **11.5 s**) | 0.60 / 1.23 s (max **15.1 s**) | 0.66 / 1.99 s (max 5.8 s) | |
| tts-1 | mp3 | 3.14 / 3.45 s | 1.64 / 3.06 s | 1.43 / 1.65 s | 4.11 → 2.74 s ✓ |
| tts-1 | wav | 1.10 / 1.36 s | 1.49 / 2.13 s | 1.22 / 2.08 s | |
| tts-1-hd | mp3 | 3.05 / 3.40 s | 2.48 / 2.67 s | 2.05 / 2.43 s | 3.80 → 2.81 s ✓ |
| tts-1-hd | wav | 1.71 / 2.03 s | 2.06 / 2.55 s | 2.28 / 2.81 s | |

**Tail test:** 20 more `gpt-4o-mini-tts` mp3 requests, cycling the three texts, with a 30 s spike timeout.
- **17 succeeded:** TTFB p50 0.94 s, p90 1.14 s, max 1.19 s.
- **3 stalled (15%).** Two produced no first byte within 30 s. One started streaming and then stopped mid-body.

**Comparison with local Kokoro (Task 7):** a short chunk synthesizes in about 1.0 s, a 27-word one in 3.0 s, with no failures. For short chunks the cloud is only slightly faster. For long chunks it's clearly faster, and the time to first sound doesn't grow with chunk length.

**Hypothesis:** H-28 (≤ 1.2 s uncached start) holds for successful requests: p90 1.14 s, all 17 successes ≤ 1.19 s. The stalls show why the timeout, prefetch and fallback path has to be designed in from the start.

## STT on the Task 8 fixtures

The Task 8 set: 50 synthetic takes, including clean, noise at 10/5 dB, a 2.5 s pause, paraphrase, half-delivered, another line, assistant bleed at −20 dB, noise only and bleed only. Settings: `language=en`, **no prompt** (Task 8 finding H-15: never bias with the chunk text). Decisions come from the app's matcher with the §B7 thresholds.

| Model | False advances | False asks | Latency p50 / p90 / max (≈ 5 s takes) | Noise-only clip | Price |
|---|---|---|---|---|---|
| **gpt-transcribe** | **0** | 1 (paraphrase, by design) | **0.81 / 1.01 / 1.34 s** | "" ✓ | $0.0045/min |
| gpt-4o-mini-transcribe | 0 | 1 (same) | 0.77 / 1.49 / **4.28 s** | "" ✓ | $0.003/min (billed by tokens; the fixtures cost ≈ $0.0015/min) |
| gpt-4o-transcribe | 0 | 1 (same) | 0.80 / 1.11 / 1.35 s | **"すげえ"** ✗ (Japanese text invented despite `language=en`) | $0.006/min |
| whisper-1 | 0 | 1 (same) | 0.86 / 1.53 / 2.14 s | "." | $0.006/min |
| *local base.en int8 (Task 8)* | 0 | 1 (same) | 0.63 s on this CPU | "" | free; 1 GB RAM, 20 s cold load |

- The accuracy is effectively the same as local `base.en`. Word error rates are 0 in every condition except the half-delivered and noisy maxima (≤ 0.25 and ≤ 0.08).
- The only false ask is the deliberate paraphrase ("You just need three tools and about an hour."), which the matcher is designed to question.
- **The bleed-only clip** (only the assistant's voice leaking into the mic) is transcribed as the assistant's line by **every** model, cloud and local. Echo protection has to come from the engine's settle/state gate and capture, not from STT (H-27 unchanged).
- The cloud adds about 0.15–0.2 s per take over local. That fits inside the §B7 decision budget (silence + 1.5 s).
- **Caveat:** the takes are synthetic voices, as in Task 8. Real-voice takes stay a Task 19 check.

## Word timings for the cloud voice

**Method:**
1. Synthesize 14 chunks with each TTS model: the Task 7 mapping lines, including E1 and the tricky numbers/abbreviations, plus the latency texts.
2. Transcribe each with `whisper-1` (`verbose_json`, word timestamps).
3. Align the heard words to the chunk's words with the Task 6 matcher, and give each script word its first aligned start.
4. Check the starts against the waveform as in Task 7: every internal silence of at least 60 ms must end where a word starts.

| TTS | Chunks fully timed | Words timed | Silences checked | Start error median / max | Within 50 ms | Signed median (− = early) |
|---|---|---|---|---|---|---|
| tts-1 | 13/14 | 142/143 | 33 | 90 / 420 ms | 12/33 | +10 ms (16 early) |
| tts-1-hd | 13/14 | 142/143 | 28 | 100 / 430 ms | 8/28 | −5 ms (14 early) |
| gpt-4o-mini-tts | 12/14 | 141/143 | 37 | 100 / 560 ms | 9/37 | +90 ms (11 early) |
| *Kokoro timestamped (Task 7)* | *8/10 mapped* | | *4* | *38 / 40 ms* | *4/4* | |

- **The errors scatter in both directions** (−560 … +310 ms), so no fixed offset corrects them. `whisper-1`'s word timestamps simply aren't that precise. Aligning costs another $0.006/min and 1.1–1.35 s per chunk (prefetchable).
- **Untimed words:**
  - "metres": `whisper-1` writes "meters", which the fuzzy match rejects.
  - "$20": dropped from the transcript entirely for one voice.
  - In both cases the chunk would fall back to chunk highlighting, so nothing is faked.
- Only `whisper-1` offers word timestamps. `gpt-transcribe`, `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` return 400 "response_format 'verbose_json' is not compatible".

### Word highlighting options (for the user)

| Option | What the creator sees with the cloud voice | Cost / latency | Honesty (§A6.4) |
|---|---|---|---|
| **A. Chunk highlight (recommended)** | The whole chunk is highlighted while it's read; word highlight only with the local Kokoro voice | none | exact |
| B. Approximate word highlight | Words underlined from whisper-1 timings (`word-approx` tier), typically 0.1 s off, sometimes 0.5 s | +$0.006/min of script audio, +1.1–1.4 s per chunk (hidden by prefetch) | real but imprecise; sometimes a neighbouring word is marked |
| C. Local voice for word highlight | Keep word highlight by using Kokoro when the user wants it (already the fallback) | local CPU, about 1 s per short chunk | exact |

## Cost

**List prices:** [OpenAI pricing](https://developers.openai.com/api/docs/pricing), fetched 2026-09-28.

| Model | Price |
|---|---|
| gpt-4o-mini-tts | $0.60 per 1M text tokens + $12 per 1M audio tokens; OpenAI estimates **≈ $0.015/min** ([model page](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)). [Community reports](https://community.openai.com/t/new-tts-api-pricing-and-gotchas/1150616) say short texts can bill at about double. |
| tts-1 | $15 per 1M chars |
| tts-1-hd | $30 per 1M chars |
| gpt-transcribe | $0.0045/min |
| gpt-4o-mini-transcribe | $0.003/min |
| gpt-4o-transcribe | $0.006/min |
| Whisper | $0.006/min |

**Assumptions:**
- TTS is paid once per unique chunk (cached by text, voice, speed and model; repeats and retakes are free).
- STT runs only on VAD-detected creator speech.

| | Assistant audio (TTS) | Creator speech sent to STT | gpt-4o-mini-tts + gpt-transcribe | + option B alignment |
|---|---|---|---|---|
| 60-s script (≈ 150 words) | ≈ 1 min | ≈ 2 min (1 take + retakes) | **≈ $0.02–0.04** | + $0.006 |
| 45-min session | ≈ 10 min of unique script | ≈ 25 min | **≈ $0.26–0.41** | + $0.06 |

The whole spike, about 120 TTS calls and 330 STT/alignment calls, came to well under $1 at list prices (estimate; check the account's usage page for the exact figure).

**Hypothesis:** H-30 (cloud speech stays small for a solo creator): validated at these rates.

## Privacy facts for the consent text (§A6.8)

Source: [OpenAI "Your data" / data controls](https://developers.openai.com/api/docs/guides/your-data), fetched 2026-09-28.

- **What is sent, only after opt-in:**
  - for the assistant voice (TTS): the text of each chunk
  - for transcription (STT): the audio of the creator's takes, i.e. only the VAD-detected speech segments
  - never the video
  - never scene cues, notes or headings, which aren't spoken
- **Training:** "data sent to the OpenAI API is not used to train or improve OpenAI models (unless you explicitly opt in to share data with us)."
- **Retention:** `/v1/audio/speech` and `/v1/audio/transcriptions` keep no application state. Abuse-monitoring logs are kept for up to **30 days**. Both endpoints are eligible for Zero Data Retention (an organization-level agreement with OpenAI, not something the app can switch on).
- **Key handling:** the API key stays on the local server (`.env`, never sent to the browser). Requests go from this machine's server to OpenAI.

## Hypotheses

| Id | Result |
|---|---|
| H-28 | **Validated with a caveat:** `gpt-4o-mini-tts` mp3 first byte p90 1.14 s, max 1.19 s over successful requests; but 15% of requests stalled for more than 30 s, so timeout, retry, prefetch and fallback are required |
| H-29 | **Refuted:** word starts derived via `whisper-1` are a median 90–100 ms off (max 560 ms); only 25–36% are within 50 ms |
| H-30 | **Validated:** ≈ $0.02–0.04 per 60-s script, ≈ $0.26–0.41 per 45-min session at list prices |
