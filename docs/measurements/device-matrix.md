# Device matrix (Task 9)

**R1 device matrix (user decision, 2026-09-28):** this Intel Mac (Chrome, Safari), an iPhone (Safari) and an Android phone (Chrome). No claims beyond it (§A6.10).
**Tool:** `spikes/capture/` (capture lab; see its README). Raw results: `spikes/capture/results/*.json`.

## Status

| Device / browser | Run | Notes |
|---|---|---|
| Headless Chromium, fake devices (smoke test only) | 2026-09-28 | Every section runs without errors; audio numbers meaningless (fake beep mic) |
| Mac · Chrome | pending | |
| Mac · Safari | pending | |
| iPhone · Safari | pending | |
| Android · Chrome | pending | |

## What the smoke test already shows (Chromium engine, fake devices)

- **Joining WebM takes by concatenating blobs doesn't work.** The result plays only the first take (1.95 s of 3.9 s). Re-recording the playback (canvas + WebAudio mix → MediaRecorder) gives a correct 4.06 s file, but in real time. Whether Safari/iOS (MP4) behaves the same is pending.
- Chrome's WebM recordings now carry a duration in the header (the old `Infinity` issue is gone).
- The MediaRecorder types offered by Chromium include VP9/VP8/H.264 WebM and MP4 (see `results/smoke-headless-chromium-*.json`).

## Results (filled in from the device runs)

| | Mac Chrome | Mac Safari | iPhone Safari | Android Chrome |
|---|---|---|---|---|
| Recorder MIME (video / audio) | | | | |
| Prompt only after tap; tracks end on stop | | | | |
| Echo: playback above floor (EC on / off) | | | | |
| **Settle time (EC on) → recommended `settleMs`** | | | | |
| Take start: clipped ms (median / max of 10) | | | | |
| Trimmed rolling recording decodes | | | | |
| 3 s video size (KB/s) · plays in system player | | | | |
| Naive join / re-recorded join | | | | |
| Output selection (`setSinkId` / `selectAudioOutput`) · Bluetooth | | | | |
| Background tab / lock screen: tracks muted or ended | | | | |

## Hypotheses to settle

H-12 (headset settle ≤ 150 ms), H-13 (echo cancellation reduces A1 leakage), H-18 (rolling recorder avoids clipping), H-19 (same-MIME stitching without ffmpeg.wasm), H-27 (no assistant residual reaches a take after settle).
