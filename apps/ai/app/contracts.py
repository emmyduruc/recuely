"""Pydantic mirrors of the shared contracts in packages/contracts (SPEC.md §B5, Task 2).

The JSON Schemas in packages/contracts/schemas are the reference; tests/test_contracts.py checks these models
against them and runs the same valid/invalid fixtures as the TS side. Rules JSON Schema can't express
(end ≥ start, timings vs timingSource) are enforced here and in packages/contracts/src/validation.ts alike.
"""

from enum import StrEnum
from typing import Annotated, ClassVar, Self, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

CONTRACT_VERSION = "0.1.0"
ENVELOPE_VERSION = "0.1"


class ContractType(StrEnum):
    ENVELOPE = "Envelope"
    WORD_TIMING = "WordTiming"
    TTS_RESULT = "TtsResult"
    TEXT_SPAN = "TextSpan"
    MATCH_RESULT = "MatchResult"
    COMMAND_EVENT = "CommandEvent"
    COMMAND_GRAMMAR = "CommandGrammar"


class Intent(StrEnum):
    START = "START"
    PAUSE = "PAUSE"
    CONTINUE = "CONTINUE"
    REPEAT = "REPEAT"
    RETAKE = "RETAKE"
    NEXT = "NEXT"
    PREVIOUS = "PREVIOUS"
    NAVIGATE = "NAVIGATE"
    SPEED = "SPEED"
    CHUNK_SIZE = "CHUNK_SIZE"
    HELP = "HELP"


class Locale(StrEnum):
    EN = "en"


class TimingSource(StrEnum):
    PROVIDER = "provider"
    BOUNDARY_EVENT = "boundary-event"
    NONE = "none"


class MatchDecision(StrEnum):
    ADVANCE = "advance"
    ASK = "ask"


class CommandSource(StrEnum):
    VOICE = "voice"
    TOUCH = "touch"
    KEYBOARD = "keyboard"


def _as_mapping(data: object) -> dict[str, object]:
    return cast(dict[str, object], data) if isinstance(data, dict) else {}


class Contract(BaseModel):
    """Strict (no coercion), camelCase on the wire, unknown fields ignored (SPEC.md §B5)."""

    model_config = ConfigDict(
        strict=True, alias_generator=to_camel, populate_by_name=True, extra="ignore", frozen=True
    )

    # Optional wire fields may be absent but never null (the JSON Schemas type them without null).
    optional_not_null: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="before")
    @classmethod
    def _reject_null_optionals(cls, data: object) -> object:
        fields = _as_mapping(data)
        nulls = sorted(name for name in cls.optional_not_null if name in fields and fields[name] is None)
        if nulls:
            raise ValueError(f"must be absent rather than null: {', '.join(nulls)}")
        return data


NonNegativeInt = Annotated[int, Field(ge=0)]
NonNegativeFloat = Annotated[float, Field(ge=0)]
UnitInterval = Annotated[float, Field(ge=0, le=1)]
NonEmpty = Annotated[str, StringConstraints(min_length=1)]


class Envelope(Contract):
    """Envelope of every event/message; a different major `v` is rejected."""

    optional_not_null = frozenset({"sessionId", "chunkId", "seq", "requestId"})

    v: Annotated[str, StringConstraints(pattern=r"^0\.\d+$")]
    type: NonEmpty
    id: NonEmpty
    session_id: NonEmpty | None = None
    chunk_id: NonEmpty | None = None
    seq: NonNegativeInt | None = None
    request_id: NonEmpty | None = None
    t: NonNegativeFloat
    payload: dict[str, JsonValue]


class TextSpan(Contract):
    """A range of chunk text in UTF-16 code units."""

    char_start: NonNegativeInt
    char_end: NonNegativeInt

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.char_end < self.char_start:
            raise ValueError("charEnd must be ≥ charStart")
        return self


class WordTiming(TextSpan):
    """One spoken word: ms from audio start, UTF-16 offsets."""

    index: NonNegativeInt
    start: NonNegativeFloat
    end: NonNegativeFloat

    @model_validator(mode="after")
    def _time_ordered(self) -> Self:
        if self.end < self.start:
            raise ValueError("end must be ≥ start")
        return self


class TtsResult(Contract):
    """Synthesized audio. `timings` is None exactly when `timing_source` is NONE (no fake word highlight)."""

    audio_url: NonEmpty
    duration_ms: NonNegativeFloat
    timings: list[WordTiming] | None
    timing_source: TimingSource
    cache_key: NonEmpty

    @model_validator(mode="after")
    def _honest_timings(self) -> Self:
        if (self.timings is None) != (self.timing_source is TimingSource.NONE):
            raise ValueError("timings must be null exactly when timingSource is none")
        return self


class MatchResult(Contract):
    """How well a take matched its chunk."""

    coverage: UnitInterval
    similarity: UnitInterval
    missing_spans: list[TextSpan]
    decision: MatchDecision
    reasons: list[str]


class CommandEvent(Contract):
    """A recognized command from voice, touch or keyboard."""

    optional_not_null = frozenset({"args", "utterance", "confidence"})

    intent: Intent
    args: dict[str, str] | None = None
    source: CommandSource
    utterance: str | None = None
    confidence: UnitInterval | None = None


GrammarPhrase = Annotated[str, StringConstraints(pattern=r"^[a-z]+( [a-z]+)*( \{target\})?$")]


class CommandGrammar(Contract):
    """Spoken phrases per intent for one locale; every intent must be present."""

    model_config = ConfigDict(extra="forbid")

    locale: Locale
    intents: dict[Intent, Annotated[list[GrammarPhrase], Field(min_length=1)]]

    @model_validator(mode="after")
    def _all_intents(self) -> Self:
        missing = [intent.value for intent in Intent if intent not in self.intents]
        if missing:
            raise ValueError(f"missing intents: {', '.join(missing)}")
        return self


CONTRACT_MODELS: dict[ContractType, type[Contract]] = {
    ContractType.ENVELOPE: Envelope,
    ContractType.WORD_TIMING: WordTiming,
    ContractType.TTS_RESULT: TtsResult,
    ContractType.TEXT_SPAN: TextSpan,
    ContractType.MATCH_RESULT: MatchResult,
    ContractType.COMMAND_EVENT: CommandEvent,
    ContractType.COMMAND_GRAMMAR: CommandGrammar,
}
