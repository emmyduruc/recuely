from fastapi.testclient import TestClient

from app.main import CONTRACT_VERSION, Capability, CapabilityStatus, app

client = TestClient(app)


def test_t0_health_reports_all_capabilities_unavailable():
    response = client.get("/v0/health")
    assert response.status_code == 200
    body = response.json()
    assert body["v"] == CONTRACT_VERSION
    assert set(body["capabilities"]) == {cap.value for cap in Capability}
    assert all(c["status"] == CapabilityStatus.UNAVAILABLE for c in body["capabilities"].values())
