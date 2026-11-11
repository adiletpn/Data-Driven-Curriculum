import pytest
from fastapi.testclient import TestClient

from app.main import app


def _login(c, username, password):
    r = c.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def client():
    c = TestClient(app)
    c.headers.update(_login(c, "admin", "admin2026"))
    return c


@pytest.fixture(scope="module")
def director():
    c = TestClient(app)
    c.headers.update(_login(c, "director", "demo2026"))
    return c


@pytest.mark.parametrize("path", [
    "/api/health", "/api/meta", "/api/overview?subject=ALG7", "/api/topics?subject=GEO7",
    "/api/topics/A07", "/api/graph?subject=ALG7", "/api/textbooks?subject=ALG7",
    "/api/hours?subject=GEO7&mode=equity", "/api/hours?subject=ALG7&textbook_id=ALG-C",
    "/api/quality?subject=ALG7", "/api/schools?subject=ALG7", "/api/equity?subject=GEO7",
    "/api/insights?subject=GEO7", "/api/report?subject=ALG7&lang=kz", "/api/data/schema",
    "/api/districts?subject=ALG7", "/api/switching?subject=GEO7", "/api/pilot?subject=ALG7",
    "/api/pilot?subject=GEO7&effect_pp=8", "/api/school/S072/risk?subject=ALG7", "/api/lesson?subject=ALG7&topic_id=A13&lang=kz",
])
def test_endpoints(client, path):
    r = client.get(path)
    assert r.status_code == 200, r.text


def test_requires_login():
    c = TestClient(app)
    assert c.get("/api/overview?subject=ALG7").status_code == 401
    assert c.get("/api/health").status_code == 200
    assert c.post("/api/auth/login", json={"username": "admin", "password": "wrong"}).status_code == 401


def test_director_sees_only_own_school(director):
    assert director.get("/api/school/S072?subject=ALG7").status_code == 200
    assert director.get("/api/school/S001?subject=ALG7").status_code == 403
    assert director.get("/api/schools?subject=ALG7").status_code == 403      # no cross-school ranking
    assert director.get("/api/textbooks?subject=ALG7").status_code == 403
    assert director.get("/api/school/S072/risk?subject=ALG7").status_code == 200
    assert director.get("/api/school/S001/risk?subject=ALG7").status_code == 403
    assert director.get("/api/pilot?subject=ALG7").status_code == 403
    rows = director.get("/api/topics?subject=ALG7&school_id=S001").json()   # school filter is forced
    own = director.get("/api/school/S072?subject=ALG7").json()["topics"]
    assert [r["mean_pct"] for r in rows] == [r["school"] for r in own]


def test_only_admin_uploads(director):
    assert director.post("/api/data/reset", json={}).status_code == 403


def test_token_in_query_for_downloads(client):
    token = client.headers["Authorization"].split()[1]
    c = TestClient(app)
    assert c.get(f"/api/export.xlsx?subject=GEO7&token={token}").status_code == 200


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


def test_excel_export(client):
    r = client.get("/api/export.xlsx?subject=ALG7")
    assert r.status_code == 200 and r.content[:2] == b"PK"


def test_template_is_a_valid_analysable_dataset(client, tmp_path):
    import io
    import zipfile
    r = client.get("/api/data/template.zip")
    assert r.status_code == 200
    names = set(zipfile.ZipFile(io.BytesIO(r.content)).namelist())
    assert {"responses.csv", "items.csv", "topics.csv"} <= names


def test_tiny_dataset_is_rejected_with_explanation(client):
    import io
    import zipfile
    src = client.get("/api/data/template.zip").content
    zin = zipfile.ZipFile(io.BytesIO(src))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for n in zin.namelist():
            data = zin.read(n)
            if n == "responses.csv":
                data = b"\n".join(data.split(b"\n")[:10])
            z.writestr(n, data)
    r = client.post("/api/data/upload", files=[("files", ("tiny.zip", out.getvalue(), "application/zip"))])
    body = r.json()
    assert body["ok"] is False and any("мало данных" in e for e in body["errors"])
