import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.mark.parametrize("path", [
    "/api/health", "/api/meta", "/api/overview?subject=ALG7", "/api/topics?subject=GEO7",
    "/api/topics/A07", "/api/graph?subject=ALG7", "/api/textbooks?subject=ALG7",
    "/api/hours?subject=GEO7&mode=equity", "/api/hours?subject=ALG7&textbook_id=ALG-C",
    "/api/quality?subject=ALG7", "/api/schools?subject=ALG7", "/api/equity?subject=GEO7",
    "/api/insights?subject=GEO7", "/api/report?subject=ALG7&lang=kz", "/api/data/schema",
])
def test_endpoints(client, path):
    r = client.get(path)
    assert r.status_code == 200, r.text


def test_unknown_subject(client):
    assert client.get("/api/overview?subject=XXX").status_code == 404


def test_whatif(client):
    r = client.post("/api/hours/whatif", json={"subject": "ALG7", "hours": {"A07": 10}})
    assert r.status_code == 200 and r.json()["custom"]


def test_offline_assistant(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    r = client.post("/api/ai/ask", json={"subject": "GEO7", "question": "Какой учебник лучше?", "lang": "ru"})
    assert r.status_code == 200 and r.json()["mode"] == "offline"


def test_upload_rejects_incomplete_dataset(client):
    r = client.post("/api/data/upload", files=[("files", ("schools.csv", b"school_id,name\nS1,A\n", "text/csv"))])
    assert r.status_code == 200 and r.json()["ok"] is False
