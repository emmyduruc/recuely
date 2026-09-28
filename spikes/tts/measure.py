"""Task 7 spike (throwaway): Kokoro TTS on this CPU.

Run one configuration per process (clean RSS): `uv run python measure.py <config> [--threads N]`; prints JSON.
Configurations: base-fp32, base-int8 (kokoro-onnx release, audio only), ts-fp32, ts-int8 (onnx-community
"timestamped" export, audio + per-phoneme durations).
"""

import json
import resource
import statistics
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

MODELS = Path(__file__).resolve().parents[2] / "models" / "kokoro"
CONFIGS = {
    "base-fp32": MODELS / "kokoro-v1.0.onnx",
    "base-int8": MODELS / "kokoro-v1.0.int8.onnx",
    "ts-fp32": MODELS / "timestamped" / "model.onnx",
    "ts-int8": MODELS / "timestamped" / "model_quantized.onnx",
}
VOICE = "af_heart"
TEXTS = {
    "short (6 words)": "Welcome back to the channel, everyone.",
    "medium (13 words)": "Today, we are going to build a small wooden shelf that fits anywhere.",
    "long (27 words)": (
        "It fits in any corner of your room, holds all of your favourite books, and you can build it step by "
        "step with only three simple tools."
    ),
}
STREAM_TEXT = "Welcome back to the channel, everyone. Today we build a shelf that fits in any corner of your room."
RUNS = 3


def load(config: str, threads: int | None) -> tuple[Kokoro, float]:
    options = ort.SessionOptions()
    if threads is not None:
        options.intra_op_num_threads = threads
    start = time.perf_counter()
    session = ort.InferenceSession(str(CONFIGS[config]), options, providers=["CPUExecutionProvider"])
    kokoro = Kokoro.from_session(session, str(MODELS / "voices-v1.0.bin"))
    # Upstream looks for an output named "duration"; the timestamped export calls it "durations".
    kokoro.has_timings = "durations" in {o.name for o in session.get_outputs()}
    return kokoro, time.perf_counter() - start


def words_from_timings(timings: list) -> list[tuple[float, float]]:
    """Group phoneme timings into words (split at spaces, drop punctuation-only groups)."""
    words, current = [], []
    for t in timings:
        if t.phoneme == " ":
            if current:
                words.append(current)
            current = []
        elif t.phoneme not in ",.!?;:—–-…\"'":
            current.append(t)
    if current:
        words.append(current)
    return [(w[0].start, w[-1].end) for w in words]


def silent_gaps(audio: np.ndarray, sr: int, min_ms: int = 60, floor_db: float = -40.0) -> list[tuple[float, float]]:
    """Regions quieter than floor_db (10 ms frames) lasting at least min_ms."""
    frame = int(sr * 0.01)
    frames = len(audio) // frame
    rms = np.sqrt(np.mean(audio[: frames * frame].reshape(frames, frame) ** 2, axis=1) + 1e-12)
    quiet = 20 * np.log10(rms / (np.max(rms) + 1e-12)) < floor_db
    gaps, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        if not q and start is not None:
            if (i - start) * 10 >= min_ms:
                gaps.append((start / 100, i / 100))
            start = None
    return gaps


def timing_check(kokoro: Kokoro) -> dict:
    """Independent check against the waveform: every internal silence (≥ 60 ms) must end where the next word is
    predicted to start. Start times drive highlighting; phrase-final end times are reported separately because
    the last phoneme's duration also covers the trailing silence."""
    text = "Welcome back, everyone. Today we build a shelf. It takes one hour, and three tools."
    audio, sr, timings = kokoro.create_timed(text, voice=VOICE)
    words = words_from_timings(timings)
    starts = [start for start, _ in words[1:]]
    gaps = [g for g in silent_gaps(audio, sr) if 0.05 < g[0] and g[1] < len(audio) / sr - 0.05]
    start_errors = [min(abs(gap_end - s) for s in starts) * 1000 for _, gap_end in gaps]
    end_overshoot = [
        (min((end for _, end in words if end >= gap_start - 0.05), default=gap_start) - gap_start) * 1000 for gap_start, _ in gaps
    ]
    text_words = [w for w in text.replace(",", " ").replace(".", " ").split() if w]
    return {
        "text_words": len(text_words),
        "timed_words": len(words),
        "gaps_checked": len(gaps),
        "max_start_error_ms": round(max(start_errors), 1) if start_errors else None,
        "median_start_error_ms": round(statistics.median(start_errors), 1) if start_errors else None,
        "max_end_overshoot_ms": round(max(end_overshoot), 1) if end_overshoot else None,
    }


def main() -> None:
    config = sys.argv[1]
    threads = int(sys.argv[sys.argv.index("--threads") + 1]) if "--threads" in sys.argv else None
    kokoro, load_s = load(config, threads)
    t = time.perf_counter()
    kokoro.create("Hello.", voice=VOICE)
    first_s = time.perf_counter() - t

    latency = {}
    for name, text in TEXTS.items():
        runs = []
        for _ in range(RUNS):
            t = time.perf_counter()
            audio, sr = kokoro.create(text, voice=VOICE)
            runs.append(time.perf_counter() - t)
        seconds = len(audio) / sr
        median = statistics.median(runs)
        latency[name] = {"median_s": round(median, 2), "audio_s": round(seconds, 2), "rtf": round(median / seconds, 2)}

    import asyncio

    async def first_chunk() -> float:
        start = time.perf_counter()
        async for _samples, _sr in kokoro.create_stream(STREAM_TEXT, voice=VOICE):
            return time.perf_counter() - start
        return float("nan")

    stream_first_s = asyncio.run(first_chunk())
    result = {
        "config": config,
        "threads": threads or "default",
        "model_mb": round(CONFIGS[config].stat().st_size / 1e6, 1),
        "load_s": round(load_s, 2),
        "first_call_s": round(first_s, 2),
        "latency": latency,
        "stream_first_chunk_s": round(stream_first_s, 2),
        "timings": kokoro.has_timings,
        "timing_check": timing_check(kokoro) if kokoro.has_timings else None,
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6, 0),
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
