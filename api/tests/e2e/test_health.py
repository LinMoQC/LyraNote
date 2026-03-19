"""
Tests for the /health endpoint and basic app sanity checks.
"""


class TestHealthEndpoint:
    async def test_health_returns_ok(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["status"] == "ok"
        assert "version" in data

    async def test_unknown_route_returns_404(self, client):
        resp = await client.get("/api/v1/nonexistent-endpoint")
        assert resp.status_code == 404
