"""The optional shared-secret header.

The deployed URL is public, and every request to it spends Vertex AI quota
on a project shared with the whole programme. These pin both states of the
flag: off, which is how it ships, and on.

The important assertions are the ones about what must NOT be locked out when
it is on. A health probe with no headers has to keep passing or Cloud Run
kills the revision, and a CORS preflight has to keep passing or the browser
reports a CORS failure and hides the real reason.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

SECRET = "a-shared-secret-value"


@pytest.fixture
def locked_client(monkeypatch):
    monkeypatch.setenv("VERITY_API_SECRET", SECRET)
    import main

    importlib.reload(main)
    yield TestClient(main.app)
    monkeypatch.delenv("VERITY_API_SECRET", raising=False)
    importlib.reload(main)


def test_off_by_default_so_nothing_changes() -> None:
    import main

    importlib.reload(main)
    client = TestClient(main.app)

    assert client.get("/health").status_code == 200
    assert client.post("/hint", json={"line_number": 1, "error_type": None, "level": 1}).status_code == 200


def test_the_right_key_is_let_through(locked_client) -> None:
    response = locked_client.post(
        "/hint",
        json={"line_number": 1, "error_type": None, "level": 1},
        headers={"X-Verity-Key": SECRET},
    )

    assert response.status_code == 200


def test_no_key_is_refused(locked_client) -> None:
    response = locked_client.post(
        "/hint", json={"line_number": 1, "error_type": None, "level": 1}
    )

    assert response.status_code == 401


def test_a_wrong_key_is_refused(locked_client) -> None:
    response = locked_client.post(
        "/hint",
        json={"line_number": 1, "error_type": None, "level": 1},
        headers={"X-Verity-Key": "not-it"},
    )

    assert response.status_code == 401


def test_the_api_prefix_is_protected_too(locked_client) -> None:
    # /api/hint and /hint are the same endpoint. Protecting one and not the
    # other would leave the door open next to the locked one.
    assert locked_client.post(
        "/api/hint", json={"line_number": 1, "error_type": None, "level": 1}
    ).status_code == 401


def test_health_stays_open_or_cloud_run_kills_the_revision(locked_client) -> None:
    assert locked_client.get("/health").status_code == 200


def test_preflight_stays_open(locked_client) -> None:
    response = locked_client.options(
        "/hint",
        headers={
            "Origin": "https://verity-ai-lovat.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-verity-key",
        },
    )

    assert response.status_code == 200
