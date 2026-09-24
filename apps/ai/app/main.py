from enum import StrEnum

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from app.contracts import ENVELOPE_VERSION


class CapabilityStatus(StrEnum):
    """Whether a capability can serve requests."""

    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


class Capability(StrEnum):
    """A service capability."""

    TTS = "tts"
    STT = "stt"
    VAD = "vad"
    SEGMENT = "segment"


class ApiTag(StrEnum):
    HEALTH = "Health"
    TTS = "TTS"
    STT = "STT"
    SEGMENTATION = "Segmentation"


class ApiErrorCode(StrEnum):
    """Stable machine-readable error code."""

    VALIDATION_FAILED = "validation_failed"
    NOT_FOUND = "not_found"
    INTERNAL = "internal_error"


# Tag registry (SPEC.md §B5.1): every route has exactly one of these.
TAG_DESCRIPTIONS: dict[ApiTag, str] = {
    ApiTag.HEALTH: "Service liveness and per-capability status.",
    ApiTag.TTS: "Text-to-speech: voices, synthesis, cached audio.",
    ApiTag.STT: "Speech-to-text for recorded takes.",
    ApiTag.SEGMENTATION: "Chunk boundary proposals (proposals only; deterministic code decides).",
}


class CapabilityHealth(BaseModel):
    """Status of one capability."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"status": "available", "model": "base.en", "version": "1.1.0"}]}
    )

    status: CapabilityStatus = Field(description="Whether the capability can serve requests.")
    model: str | None = Field(default=None, description="Loaded model name, or null when none is loaded.")
    version: str | None = Field(default=None, description="Model or provider version, or null when unknown.")


class HealthResponse(BaseModel):
    """Overall service status and the status of each capability."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "v": "0.1",
                    "status": "degraded",
                    "capabilities": {
                        "tts": {"status": "unavailable", "model": None, "version": None},
                        "stt": {"status": "unavailable", "model": None, "version": None},
                        "vad": {"status": "unavailable", "model": None, "version": None},
                        "segment": {"status": "unavailable", "model": None, "version": None},
                    },
                }
            ]
        }
    )

    v: str = Field(description="Contract version of the service (SPEC.md §B5 envelope).")
    status: CapabilityStatus = Field(description="`available` only when every capability is available.")
    capabilities: dict[Capability, CapabilityHealth] = Field(description="Status per capability.")


class ApiError(BaseModel):
    """The body of every error response from the AI service."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"statusCode": 500, "code": "internal_error", "message": "Something went wrong."}]
        }
    )

    statusCode: int = Field(description="HTTP status code, repeated in the body.")
    code: ApiErrorCode = Field(description="Stable machine-readable code.")
    message: str = Field(description="Human-readable explanation, safe to show.")


app = FastAPI(
    title="AI service",
    description="Local speech services for the recording companion: health, TTS, STT, segmentation.",
    version="0.1.0",
    openapi_tags=[{"name": tag.value, "description": text} for tag, text in TAG_DESCRIPTIONS.items()],
)


@app.get(
    "/v0/health",
    tags=[ApiTag.HEALTH],
    operation_id="getHealth",
    summary="Report service and capability status",
    description=(
        "Always answers 200 while the service runs. Each capability reports `available`, `degraded` or "
        "`unavailable`. No side effects; safe to poll."
    ),
    response_model=HealthResponse,
    responses={500: {"model": ApiError, "description": "An unexpected error occurred."}},
)
def health() -> HealthResponse:
    # No providers are wired yet (Task 10); every capability reports unavailable.
    capabilities = {cap: CapabilityHealth(status=CapabilityStatus.UNAVAILABLE) for cap in Capability}
    return HealthResponse(v=ENVELOPE_VERSION, status=CapabilityStatus.DEGRADED, capabilities=capabilities)
