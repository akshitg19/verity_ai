from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main
from identity_auth import (
    GoogleIdentitySettings,
    IdentityNotAllowed,
    IdentityProviderUnavailable,
    IdentityTokenInvalid,
    VerifiedIdentity,
)


AUTH_SETTINGS = GoogleIdentitySettings(
    enabled=True,
    client_id="preview-client.apps.googleusercontent.com",
    allowed_domains=frozenset({"wisc.edu"}),
)
IDENTITY = VerifiedIdentity(
    subject="stable-subject",
    email="reviewer@wisc.edu",
    hosted_domain="wisc.edu",
)


@pytest.fixture
def authenticated_client():
    with patch.object(main, "IDENTITY_AUTH_SETTINGS", AUTH_SETTINGS):
        yield TestClient(main.app)


def post_hint(client, headers=None):
    return client.post(
        "/hint",
        json={"line_number": 1, "error_type": None, "level": 1},
        headers=headers,
    )


def test_valid_google_identity_reaches_the_api(authenticated_client) -> None:
    with patch.object(main, "verify_bearer_token", return_value=IDENTITY) as verify:
        response = post_hint(
            authenticated_client,
            headers={"Authorization": "Bearer signed.jwt.token"},
        )

    assert response.status_code == 200
    verify.assert_called_once_with("Bearer signed.jwt.token", AUTH_SETTINGS)


@pytest.mark.parametrize(
    "failure,status,detail",
    [
        (IdentityTokenInvalid("invalid"), 401, "Authentication required"),
        (IdentityNotAllowed("denied"), 403, "Account is not permitted"),
        (
            IdentityProviderUnavailable("offline"),
            503,
            "Authentication is temporarily unavailable",
        ),
    ],
)
def test_identity_failures_are_content_safe(
    authenticated_client, failure, status, detail
) -> None:
    with patch.object(main, "verify_bearer_token", side_effect=failure):
        response = post_hint(authenticated_client)

    assert response.status_code == status
    assert response.json() == {"detail": detail}
    assert "signed.jwt.token" not in response.text


def test_shared_browser_key_cannot_bypass_real_auth(authenticated_client) -> None:
    with (
        patch.object(main, "API_SECRET", "shared-speed-bump"),
        patch.object(
            main,
            "verify_bearer_token",
            side_effect=IdentityTokenInvalid("missing bearer token"),
        ),
    ):
        response = post_hint(
            authenticated_client,
            headers={"X-Verity-Key": "shared-speed-bump"},
        )

    assert response.status_code == 401


def test_health_and_preflight_remain_open_for_cloud_run_and_cors(
    authenticated_client,
) -> None:
    assert authenticated_client.get("/health").status_code == 200
    response = authenticated_client.options(
        "/hint",
        headers={
            "Origin": "https://verity-ai-lovat.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "https://verity-ai-lovat.vercel.app"
    )


def test_google_identity_boundary_can_guard_the_myscript_route(monkeypatch) -> None:
    monkeypatch.setenv("MYSCRIPT_POC_ROUTE_ENABLED", "true")
    with (
        patch.object(main, "IDENTITY_AUTH_SETTINGS", AUTH_SETTINGS),
        patch.object(main, "API_SECRET", ""),
    ):
        assert main._myscript_poc_route_is_enabled() is True
