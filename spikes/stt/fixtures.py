"""Task 8 spike (throwaway): synthetic takes for STT/VAD measurement.

A "creator" voice (Kokoro am_michael / bm_george) reads a line; variants add noise, a mid-sentence pause, a
paraphrase, half a line, another line, or residual assistant speech (af_heart at -20 dB, as a speaker echo
would leave). Every clip's true speech onset and reference text are known. Output: audio/*.wav (16 kHz mono)
and audio/manifest.json. Real takes from the user can be added to the manifest later.
"""

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro
from scipy.signal import resample_poly

HERE = Path(__file__).parent
MODELS = HERE.parents[1] / "models" / "kokoro"
OUT = HERE / "audio"
SR = 16_000
LEAD_S = 0.6
TAIL_S = 1.0
PAUSE_S = 2.5
BLEED_DB = -20.0
rng = np.random.default_rng(8)

LINES = [
    ("Welcome back to the channel, everyone.", "Welcome back to my channel, everyone."),
    ("Today, we are going to build a small wooden shelf.", "Today we're going to build a little wooden shelf."),
    ("It fits in any corner of your room and holds your favourite books.", "It fits into any corner of your room and holds your favorite books."),
    ("You only need three tools and about one hour.", "You just need three tools and about an hour."),
    ("Press the button and wait for the green light.", "Press the button, then wait for the green light."),
    ("Thanks for watching, and see you in the next video.", "Thanks for watching, see you in the next video."),
]
CREATORS = ["am_michael", "bm_george"]


def kokoro() -> Kokoro:
    session = ort.InferenceSession(str(MODELS / "timestamped" / "model.onnx"), providers=["CPUExecutionProvider"])
    k = Kokoro.from_session(session, str(MODELS / "voices-v1.0.bin"))
    k.has_timings = True
    return k


def synth(k: Kokoro, text: str, voice: str) -> tuple[np.ndarray, list[float]]:
    audio, sr, timings = k.create_timed(text, voice=voice)
    starts, previous = [], " "
    for t in timings:
        if previous == " " and t.phoneme != " ":
            starts.append(t.start)
        previous = t.phoneme
    return resample_poly(audio, SR, sr).astype(np.float32), starts


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * SR), dtype=np.float32)


def pink_noise(n: int) -> np.ndarray:
    white = rng.standard_normal(n)
    spectrum = np.fft.rfft(white) / np.maximum(1, np.sqrt(np.arange(n // 2 + 1)))
    noise = np.fft.irfft(spectrum, n)
    return (noise / np.max(np.abs(noise))).astype(np.float32)


def add_noise(clip: np.ndarray, speech: np.ndarray, snr_db: float) -> np.ndarray:
    noise = pink_noise(len(clip))
    speech_rms = np.sqrt(np.mean(speech**2))
    noise_rms = np.sqrt(np.mean(noise**2))
    return clip + noise * (speech_rms / noise_rms) / (10 ** (snr_db / 20))


def place(speech: np.ndarray) -> np.ndarray:
    return np.concatenate([silence(LEAD_S), speech, silence(TAIL_S)])


def main() -> None:
    OUT.mkdir(exist_ok=True)
    k = kokoro()
    manifest = []

    def save(name: str, clip: np.ndarray, **meta: object) -> None:
        peak = np.max(np.abs(clip))
        sf.write(OUT / f"{name}.wav", clip / max(1.0, peak / 0.95), SR)
        manifest.append({"file": f"{name}.wav", "seconds": round(len(clip) / SR, 2), **meta})

    for index, (line, paraphrase) in enumerate(LINES):
        creator = CREATORS[index % len(CREATORS)]
        speech, starts = synth(k, line, creator)
        base = {"line": index, "chunk": line, "voice": creator, "onset_s": LEAD_S}
        save(f"l{index}-clean", place(speech), **base, condition="clean", reference=line, expect="advance")
        for snr in (10, 5):
            clip = place(speech)
            save(f"l{index}-noise{snr}", add_noise(clip, speech, snr), **base, condition=f"noise {snr} dB", reference=line, expect="advance")
        # Pause at the middle word start (mid-sentence), same take.
        cut = int(starts[len(starts) // 2] * SR)
        paused = np.concatenate([speech[:cut], silence(PAUSE_S), speech[cut:]])
        save(f"l{index}-paused", place(paused), **base, condition=f"paused {PAUSE_S} s", reference=line, expect="advance", pause_at_s=round(LEAD_S + cut / SR, 2))
        para, _ = synth(k, paraphrase, creator)
        save(f"l{index}-paraphrase", place(para), **base, condition="paraphrase", reference=paraphrase, expect="advance")
        words = line.split()
        half_text = " ".join(words[: max(2, len(words) // 2)])
        half, _ = synth(k, half_text, creator)
        save(f"l{index}-half", place(half), **base, condition="half-delivered", reference=half_text, expect="ask")
        other = LINES[(index + 1) % len(LINES)][0]
        wrong, _ = synth(k, other, creator)
        save(f"l{index}-otherline", place(wrong), **base, condition="another line", reference=other, expect="ask")
        # Residual assistant speech (the assistant read the chunk; the speaker echo leaks into the mic) before
        # the creator starts, then the creator reads the line.
        assistant, _ = synth(k, line, "af_heart")
        tail = assistant[-int(0.5 * SR) :] * (10 ** (BLEED_DB / 20))
        clip = place(speech)
        clip[: len(tail)] += tail
        save(f"l{index}-bleed", clip, **base, condition=f"assistant bleed {int(BLEED_DB)} dB", reference=line, expect="advance")

    # Clips with no creator speech at all: any VAD start is a false start.
    save("noise-only", pink_noise(4 * SR) * 0.02, line=None, chunk=None, voice=None, onset_s=None, condition="noise only", reference="", expect=None)
    assistant, _ = synth(k, LINES[0][0], "af_heart")
    save("bleed-only", np.concatenate([assistant * (10 ** (BLEED_DB / 20)), silence(1.0)]), line=None, chunk=None, voice=None, onset_s=None, condition=f"assistant bleed only {int(BLEED_DB)} dB", reference="", expect=None)

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"{len(manifest)} clips in {OUT}")


if __name__ == "__main__":
    main()
