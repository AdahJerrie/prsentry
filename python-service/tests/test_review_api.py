from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.analysis as analysis
from app.main import app


@pytest.fixture(autouse=True)
def reset_env_and_client(monkeypatch):
    monkeypatch.setenv("INTERNAL_AUTH_TOKEN", "test_shared_secret_token")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    analysis.client = None
    yield
    analysis.client = None


def test_health_endpoint():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_review_rejects_missing_or_wrong_auth_token():
    client = TestClient(app)
    payload = {"pr_id": 10, "repo": "acme/backend", "files": []}

    no_auth = client.post("/review", json=payload)
    assert no_auth.status_code == 401

    bad_auth = client.post(
        "/review",
        json=payload,
        headers={"Authorization": "Bearer wrong_token"},
    )
    assert bad_auth.status_code == 401


def test_review_returns_structured_findings_and_block_on_high_severity():
    fake_tool_block = SimpleNamespace(
        type="tool_use",
        name="submit_findings",
        input={
            "findings": [
                {
                    "line_number": 19,
                    "severity": "high",
                    "category": "security",
                    "message": "Raw SQL string interpolation enables SQL injection.",
                }
            ]
        },
    )
    fake_llm = SimpleNamespace(
        messages=SimpleNamespace(
            create=AsyncMock(return_value=SimpleNamespace(content=[fake_tool_block]))
        )
    )
    analysis.client = fake_llm

    client = TestClient(app)
    res = client.post(
        "/review",
        headers={"Authorization": "Bearer test_shared_secret_token"},
        json={
            "pr_id": 42,
            "repo": "acme/backend",
            "files": [
                {
                    "path": "internal/db/query.go",
                    "diff": "@@ -15,3 +15,5 @@\n+q := fmt.Sprintf(\"SELECT * FROM users WHERE id=%s\", id)",
                }
            ],
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["pr_id"] == 42
    assert body["risk_score"] == 5.0
    assert body["merge_recommendation"] == "block"
    assert len(body["findings"]) == 1
    assert body["findings"][0]["file_path"] == "internal/db/query.go"
    assert body["findings"][0]["severity"] == "high"
    assert body["findings"][0]["category"] == "security"


def test_review_fails_closed_with_502_when_all_llm_calls_fail():
    fake_llm = SimpleNamespace(
        messages=SimpleNamespace(
            create=AsyncMock(side_effect=RuntimeError("Upstream LLM timeout"))
        )
    )
    analysis.client = fake_llm

    client = TestClient(app)
    res = client.post(
        "/review",
        headers={"Authorization": "Bearer test_shared_secret_token"},
        json={
            "pr_id": 99,
            "repo": "acme/backend",
            "files": [{"path": "auth.py", "diff": "@@ -1,2 +1,3 @@\n+pass"}],
        },
    )

    # Must NOT return 200 OK + "safe" when LLM completely fails
    assert res.status_code == 502
    assert "RuntimeError" not in res.json()["detail"]


def test_review_downgrades_to_caution_on_partial_file_failure():
    call_count = 0

    async def flaky_create(**_kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise ConnectionError("Transient reset")
        return SimpleNamespace(
            content=[
                SimpleNamespace(
                    type="tool_use",
                    name="submit_findings",
                    input={"findings": []},
                )
            ]
        )

    analysis.client = SimpleNamespace(messages=SimpleNamespace(create=flaky_create))

    client = TestClient(app)
    res = client.post(
        "/review",
        headers={"Authorization": "Bearer test_shared_secret_token"},
        json={
            "pr_id": 55,
            "repo": "acme/backend",
            "files": [
                {"path": "a.go", "diff": "@@ -1 +1 @@\n+a"},
                {"path": "b.go", "diff": "@@ -1 +1 @@\n+b"},
            ],
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["merge_recommendation"] == "caution"
    assert body["risk_score"] >= 3.0
    assert "could not be analyzed" in body["summary"]
