"""Task 7 spike (throwaway): can Kokoro's phoneme timings be mapped back onto the script's words?

Strategy: phonemize each script word on its own to learn how many spoken words it becomes (e.g. "3.5" → three),
then check that the sentence's phoneme words add up. If they do, word i of the script owns a known run of timed
phoneme words and gets their start time.
"""

import json
from pathlib import Path

from measure import load

PUNCT = set(",.!?;:—–-…\"'()")
LINES = [
    "Welcome back, everyone. Today we're launching something new.",
    "It's small, light, and fast. Dr. Smith designed it — with care.",
    "Here it is, finally.",
    "Let's open it together.",
    "First, charge it overnight.",
    "Use 3 screws, 2 brackets and 1.5 metres of wood.",
    "We start at 10:30, e.g. right after lunch, in the U.S. office.",
    "The well-known résumé trick costs $20 — or 15% less.",
    "Hi there 👋 and welcome to part 2!",
    "It's the 21st time we've done this, and it won't be the last.",
]


def spoken_words(phonemes: str) -> list[str]:
    """Phoneme words, as kokoro-onnx separates them (spaces), ignoring punctuation-only pieces."""
    return [w for w in phonemes.split(" ") if w and not all(c in PUNCT for c in w)]


def main() -> None:
    kokoro, _ = load("ts-fp32", None)
    tokenizer = kokoro.tokenizer
    results = []
    for line in LINES:
        words = [w for w in line.split() if not all(c in PUNCT for c in w)]
        per_word = [len(spoken_words(tokenizer.phonemize(w, "en-us"))) for w in words]
        whole = len(spoken_words(tokenizer.phonemize(line, "en-us")))
        results.append({"line": line, "script_words": len(words), "sum_per_word": sum(per_word), "sentence": whole, "maps": sum(per_word) == whole})
    ok = sum(r["maps"] for r in results)
    print(json.dumps({"lines": len(results), "mappable": ok, "results": results}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    Path(__file__).parent.joinpath("mapping.json").write_text("")
    main()
