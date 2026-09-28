"""Task 8 spike (throwaway): Silero VAD vs a simple energy VAD (what an in-browser AudioWorklet would run).

For every clip: detected speech segments, onset latency vs the known onset, false starts (speech before the
creator speaks, or any speech in noise-only / assistant-bleed-only clips), and the mid-sentence pause.
`uv run python vad.py` → results/vad.json + a printed summary.
"""

import json
import statistics
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf

HERE = Path(__file__).parent
SR = 16_000


class Silero:
    """Streaming Silero v5: 512-sample windows with 64 samples of context and a recurrent state."""

    WINDOW = 512
    CONTEXT = 64

    def __init__(self) -> None:
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        self.session = ort.InferenceSession(str(HERE.parents[1] / "models" / "silero" / "silero_vad.onnx"), options, providers=["CPUExecutionProvider"])

    def probabilities(self, audio: np.ndarray) -> tuple[list[float], float]:
        state = np.zeros((2, 1, 128), dtype=np.float32)
        context = np.zeros((1, self.CONTEXT), dtype=np.float32)
        probs, start = [], time.perf_counter()
        for i in range(0, len(audio) - self.WINDOW + 1, self.WINDOW):
            chunk = audio[i : i + self.WINDOW][None, :]
            x = np.concatenate([context, chunk], axis=1)
            out, state = self.session.run(None, {"input": x, "state": state, "sr": np.array(SR, dtype=np.int64)})
            probs.append(float(out[0][0]))
            context = chunk[:, -self.CONTEXT :]
        return probs, time.perf_counter() - start


def segments(active: list[bool], frame_s: float, min_on: int, min_off: int) -> list[tuple[float, float]]:
    """Hysteresis: speech starts after min_on active frames, ends after min_off inactive frames."""
    out, start, on, off = [], None, 0, 0
    for i, a in enumerate(active):
        if start is None:
            on = on + 1 if a else 0
            if on >= min_on:
                start = (i - min_on + 1) * frame_s
                off = 0
        else:
            off = 0 if a else off + 1
            if off >= min_off:
                out.append((round(start, 3), round((i - min_off + 1) * frame_s, 3)))
                start, on = None, 0
    if start is not None:
        out.append((round(start, 3), round(len(active) * frame_s, 3)))
    return out


def silero_segments(model: Silero, audio: np.ndarray) -> tuple[list[tuple[float, float]], float]:
    probs, cost = model.probabilities(audio)
    # Standard Silero settings: start ≥ 0.5, end below 0.35 for ~100 ms.
    active, speaking = [], False
    for p in probs:
        speaking = p >= 0.5 if not speaking else p >= 0.35
        active.append(speaking)
    return segments(active, Silero.WINDOW / SR, min_on=2, min_off=3), cost


def energy_segments(audio: np.ndarray) -> list[tuple[float, float]]:
    """Adaptive energy VAD on 20 ms frames: speech when ≥ 12 dB over the running noise floor."""
    frame = int(0.02 * SR)
    n = len(audio) // frame
    rms = np.sqrt(np.mean(audio[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-10)
    db = 20 * np.log10(rms)
    floor = float(np.percentile(db[: max(1, int(0.3 / 0.02))], 50))
    active = []
    for value in db:
        speech = value > floor + 12 and value > -55
        active.append(bool(speech))
        if not speech:
            floor = 0.95 * floor + 0.05 * float(value)
    return segments(active, 0.02, min_on=3, min_off=10)


def assess(clip: dict, found: list[tuple[float, float]]) -> dict:
    onset = clip["onset_s"]
    if onset is None:
        return {"false_start": len(found) > 0, "segments": found}
    early = [s for s in found if s[1] < onset - 0.05]
    first = next((s for s in found if s[1] >= onset - 0.05), None)
    result = {
        "false_start": len(early) > 0,
        "onset_latency_ms": None if first is None else round((first[0] - onset) * 1000),
        "missed": first is None,
        "segments": found,
    }
    if "pause_at_s" in clip:
        pause = clip["pause_at_s"]
        result["ended_in_pause"] = any(pause - 0.3 < end < pause + 2.5 for _, end in found)
        result["restarted_after_pause"] = any(pause + 1.0 < start < pause + 3.2 for start, _ in found)
    return result


def main() -> None:
    manifest = json.loads((HERE / "audio" / "manifest.json").read_text())
    model = Silero()
    rows, cost, seconds = [], 0.0, 0.0
    for clip in manifest:
        audio, _ = sf.read(HERE / "audio" / clip["file"], dtype="float32")
        found, spent = silero_segments(model, audio)
        cost += spent
        seconds += len(audio) / SR
        rows.append({"file": clip["file"], "condition": clip["condition"], "silero": assess(clip, found), "energy": assess(clip, energy_segments(audio))})
    summary = {}
    for vad in ("silero", "energy"):
        latencies = [r[vad]["onset_latency_ms"] for r in rows if r[vad].get("onset_latency_ms") is not None]
        paused = [r[vad] for r in rows if "ended_in_pause" in r[vad]]
        summary[vad] = {
            "false_starts": [r["file"] for r in rows if r[vad]["false_start"]],
            "missed": [r["file"] for r in rows if r[vad].get("missed")],
            "onset_latency_ms_median": statistics.median(latencies),
            "onset_latency_ms_max": max(latencies),
            "onset_latency_ms_min": min(latencies),
            "pause_ends_segment": f"{sum(p['ended_in_pause'] for p in paused)}/{len(paused)}",
            "pause_restarts": f"{sum(p['restarted_after_pause'] for p in paused)}/{len(paused)}",
        }
    summary["silero"]["cpu_ms_per_audio_s"] = round(cost / seconds * 1000, 1)
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results" / "vad.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=1))
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
