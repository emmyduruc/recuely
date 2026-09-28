"""Task 8 spike (throwaway): faster-whisper on this CPU.

`uv run python stt.py <model> [--beam N]` transcribes every clip in audio/manifest.json twice (no prompt, and
with the chunk text as `initial_prompt`, to test biasing: H-15) and writes results/stt-<model>-b<N>.json.
"""

import json
import resource
import sys
import time
from pathlib import Path

import soundfile as sf
from faster_whisper import WhisperModel

HERE = Path(__file__).parent
MODELS = HERE.parents[1] / "models" / "whisper"


def main() -> None:
    model_name = sys.argv[1]
    beam = int(sys.argv[sys.argv.index("--beam") + 1]) if "--beam" in sys.argv else 1
    manifest = json.loads((HERE / "audio" / "manifest.json").read_text())
    start = time.perf_counter()
    model = WhisperModel(model_name, device="cpu", compute_type="int8", download_root=str(MODELS))
    load_s = time.perf_counter() - start
    # Warm-up (first call pays one-time costs).
    audio, _ = sf.read(HERE / "audio" / manifest[0]["file"], dtype="float32")
    list(model.transcribe(audio, language="en", beam_size=beam)[0])

    rows = []
    for clip in manifest:
        audio, _ = sf.read(HERE / "audio" / clip["file"], dtype="float32")
        for biased in (False, True):
            prompt = clip["chunk"] if biased and clip["chunk"] else None
            t = time.perf_counter()
            segments, _info = model.transcribe(audio, language="en", beam_size=beam, initial_prompt=prompt, condition_on_previous_text=False)
            text = " ".join(segment.text.strip() for segment in segments)
            rows.append({**clip, "biased": biased, "transcript": text, "latency_s": round(time.perf_counter() - t, 3)})
    out = HERE / "results" / f"stt-{model_name}-b{beam}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        "model": model_name,
        "beam": beam,
        "load_s": round(load_s, 2),
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6),
        "rows": rows,
    }, indent=1))
    print(f"{model_name} beam {beam}: load {load_s:.1f}s, {len(rows)} transcriptions → {out.name}")


if __name__ == "__main__":
    main()
