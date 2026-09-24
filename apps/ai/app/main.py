from enum import StrEnum

from fastapi import FastAPI
from pydantic import BaseModel

CONTRACT_VERSION = "0.1"


class CapabilityStatus(StrEnum):
    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


class Capability(StrEnum):
    TTS = "tts"
    STT = "stt"
    VAD = "vad"
    SEGMENT = "segment"


class CapabilityHealth(BaseModel):
    status: CapabilityStatus
    model: str | None = None
    version: str | None = None


class HealthResponse(BaseModel):
    v: str
    status: CapabilityStatus
    capabilities: dict[Capability, CapabilityHealth]


app = FastAPI(title="ai-service", version="0.1.0")


@app.get("/v0/health")
def health() -> HealthResponse:
    # No providers are wired yet (Task 10); every capability reports unavailable.
    capabilities = {cap: CapabilityHealth(status=CapabilityStatus.UNAVAILABLE) for cap in Capability}
    return HealthResponse(v=CONTRACT_VERSION, status=CapabilityStatus.DEGRADED, capabilities=capabilities)
