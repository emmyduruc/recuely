"""Task 2: the Python side of the shared contract fixtures (packages/contracts/fixtures)."""

import json
from enum import StrEnum
from pathlib import Path
from typing import Any, cast

import pytest
from pydantic import ValidationError

from app.contracts import (
    CONTRACT_MODELS,
    CONTRACT_VERSION,
    CommandGrammar,
    CommandSource,
    ContractType,
    Intent,
    Locale,
    MatchDecision,
    SpeechProvider,
    TimingSource,
)
from app.text_offsets import index_to_utf16, slice_utf16, utf16_length, utf16_to_index

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = CONTRACTS / "fixtures"
SCHEMAS = CONTRACTS / "schemas"

Json = dict[str, Any]


def load(path: Path) -> Json:
    return cast(Json, json.loads(path.read_text(encoding="utf-8")))


def cases(kind: str) -> list[tuple[ContractType, str, Any]]:
    out: list[tuple[ContractType, str, Any]] = []
    for contract in ContractType:
        fixture = load(FIXTURES / "contracts" / f"{contract.value}.json")
        out.extend((contract, case["name"], case["value"]) for case in cast(list[Json], fixture[kind]))
    return out


@pytest.mark.parametrize(("contract", "name", "value"), cases("valid"), ids=str)
def test_t2_valid_fixtures_pass(contract: ContractType, name: str, value: Any):  # noqa: ANN401
    model_type = CONTRACT_MODELS[contract]
    model = model_type.model_validate_json(json.dumps(value))
    known = {field.alias or key for key, field in model_type.model_fields.items()}
    # Unknown fields are ignored (SPEC.md §B5), so the round trip keeps only known ones.
    expected = {key: item for key, item in cast(Json, value).items() if key in known}
    assert model.model_dump(by_alias=True, exclude_unset=True) == expected, name


@pytest.mark.parametrize(("contract", "name", "value"), cases("invalid"), ids=str)
def test_t2_invalid_fixtures_fail(contract: ContractType, name: str, value: Any):  # noqa: ANN401
    with pytest.raises(ValidationError):
        CONTRACT_MODELS[contract].model_validate_json(json.dumps(value))
    assert name


def test_t2_optional_fields_may_be_absent_but_not_null():
    envelope = CONTRACT_MODELS[ContractType.ENVELOPE]
    base: Json = {"v": "0.1", "type": "x", "id": "m", "t": 1, "payload": {}}
    envelope.model_validate_json(json.dumps(base))
    with pytest.raises(ValidationError):
        envelope.model_validate_json(json.dumps({**base, "seq": None}))


@pytest.mark.parametrize("contract", list(ContractType), ids=str)
def test_t2_models_match_the_published_schemas(contract: ContractType):
    schema = load(SCHEMAS / f"{contract.value}.json")
    generated = CONTRACT_MODELS[contract].model_json_schema(by_alias=True)
    assert set(cast(Json, generated["properties"])) == set(cast(Json, schema["properties"]))
    assert set(cast(list[str], generated.get("required", []))) == set(cast(list[str], schema["required"]))


ENUM_FIELDS: list[tuple[ContractType, str, type[StrEnum]]] = [
    (ContractType.TTS_RESULT, "timingSource", TimingSource),
    (ContractType.MATCH_RESULT, "decision", MatchDecision),
    (ContractType.COMMAND_EVENT, "intent", Intent),
    (ContractType.COMMAND_EVENT, "source", CommandSource),
    (ContractType.COMMAND_GRAMMAR, "locale", Locale),
    (ContractType.SPEECH_VOICE, "provider", SpeechProvider),
]


@pytest.mark.parametrize(("contract", "field", "enum"), ENUM_FIELDS, ids=str)
def test_t2_enum_values_match_the_schemas(contract: ContractType, field: str, enum: type[StrEnum]):
    schema = load(SCHEMAS / f"{contract.value}.json")
    allowed = cast(list[str], cast(Json, schema["properties"])[field]["enum"])
    assert sorted(allowed) == sorted(member.value for member in enum)


def test_t2_contract_version_matches_the_package():
    assert load(CONTRACTS / "package.json")["version"] == CONTRACT_VERSION


def test_t2_the_en_grammar_loads_with_every_intent():
    grammar = CommandGrammar.model_validate_json(
        (FIXTURES / "grammar" / "en.json").read_text(encoding="utf-8")
    )
    assert set(grammar.intents) == set(Intent)
    assert "stop" in grammar.intents[Intent.PAUSE]


UTF16 = load(FIXTURES / "text" / "utf16-offsets.json")
TEXT = cast(str, UTF16["text"])


def test_t2_utf16_length_differs_from_code_points():
    assert utf16_length(TEXT) == UTF16["utf16Length"]
    assert len(TEXT) == UTF16["codePointLength"]


@pytest.mark.parametrize("span", cast(list[Json], UTF16["spans"]), ids=lambda s: str(s["label"]))
def test_t2_utf16_offsets_select_the_same_text_as_js(span: Json):
    assert slice_utf16(TEXT, span["start"], span["end"]) == span["text"]
    start_index = utf16_to_index(TEXT, span["start"])
    assert index_to_utf16(TEXT, start_index) == span["start"]


def test_t2_an_offset_inside_a_surrogate_pair_is_rejected():
    emoji = next(s for s in cast(list[Json], UTF16["spans"]) if s["label"] == "emoji with skin tone")
    with pytest.raises(ValueError, match="surrogate"):
        utf16_to_index(TEXT, emoji["start"] + 1)
