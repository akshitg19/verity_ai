import json
import sys
from pathlib import Path

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT))

from scripts.verify_disabled_myscript_revision import (  # noqa: E402
    VerificationError,
    run_verification,
    validate_service_metadata,
)
from scripts import verify_disabled_myscript_revision as verifier  # noqa: E402


PRIVATE_SENTINEL = "private-runtime-value-must-not-escape"
SERVICE_URL = "https://verity-ai-example.us-central1.run.app"
FRONTEND_URL = "https://verity-ai-lovat.vercel.app"
REVISION_NAME = "verity-ai-00018-fdv"
DIGEST = (
    "us-central1-docker.pkg.dev/cs-sail-2b08/cloud-run-source-deploy/"
    "verity-ai@sha256:a535527fdd58f55ea2963d7f6ded8ebcbdbc24113323d19311a2e66bb0913041"
)


def service_document(
    *,
    enabled="false",
    route_enabled="false",
    shared_access="false",
    auth_mode="off",
    api_secret="",
    google_client_id="",
    allowed_subjects="",
    allowed_emails=None,
    allowed_domains="",
    version="1",
):
    access_environment = [
        {"name": "MYSCRIPT_ALLOW_SHARED_ACCESS", "value": shared_access},
        {"name": "VERITY_AUTH_MODE", "value": auth_mode},
        {"name": "VERITY_API_SECRET", "value": api_secret},
        {"name": "VERITY_GOOGLE_CLIENT_ID", "value": google_client_id},
        {"name": "VERITY_AUTH_ALLOWED_SUBJECTS", "value": allowed_subjects},
        {"name": "VERITY_AUTH_ALLOWED_DOMAINS", "value": allowed_domains},
    ]
    if allowed_emails is not None:
        access_environment.append(
            {"name": "VERITY_AUTH_ALLOWED_EMAILS", "value": allowed_emails}
        )
    return {
        "spec": {
            "template": {
                "spec": {
                    "serviceAccountName": (
                        "verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com"
                    ),
                    "containers": [
                        {
                            "image": (
                                "us-central1-docker.pkg.dev/cs-sail-2b08/"
                                "cloud-run-source-deploy/verity-ai:22ce718-disabled"
                            ),
                            "env": [
                                {"name": "UNRELATED_PRIVATE_SETTING", "value": PRIVATE_SENTINEL},
                                {"name": "MYSCRIPT_ENABLED", "value": enabled},
                                {
                                    "name": "MYSCRIPT_POC_ROUTE_ENABLED",
                                    "value": route_enabled,
                                },
                                *access_environment,
                                {
                                    "name": "MYSCRIPT_APPLICATION_KEY",
                                    "valueFrom": {
                                        "secretKeyRef": {
                                            "name": "verity-myscript-application-key",
                                            "key": version,
                                        }
                                    },
                                },
                                {
                                    "name": "MYSCRIPT_HMAC_KEY",
                                    "valueFrom": {
                                        "secretKeyRef": {
                                            "name": "verity-myscript-hmac-key",
                                            "key": version,
                                        }
                                    },
                                },
                            ],
                        }
                    ],
                }
            }
        },
        "status": {
            "latestReadyRevisionName": REVISION_NAME,
            "latestCreatedRevisionName": REVISION_NAME,
            "url": SERVICE_URL,
            "traffic": [
                {
                    "latestRevision": True,
                    "percent": 100,
                    "revisionName": REVISION_NAME,
                }
            ],
        },
    }


def revision_document():
    return {
        "metadata": {"name": REVISION_NAME},
        "status": {"imageDigest": DIGEST},
    }


def successful_request(url, data, headers):
    if url == SERVICE_URL + "/health":
        assert data is None
        return 200, b'{"status":"ok"}'
    if url == SERVICE_URL + "/openapi.json":
        assert data is None
        return 200, json.dumps(
            {"paths": {"/handwriting/myscript/recognize": {"post": {}}}}
        ).encode()
    if url == SERVICE_URL + "/api/handwriting/myscript/recognize":
        assert headers == {"Content-Type": "application/json"}
        payload = json.loads(data)
        assert payload["strokes"][0]["id"] == "synthetic-disabled-check"
        return 404, b'{"detail":"Not Found"}'
    if url == FRONTEND_URL + "/":
        assert data is None
        return 200, b"frontend content is deliberately not reported"
    raise AssertionError(f"unexpected URL: {url}")


def test_verifier_returns_only_allowlisted_metadata_and_content_safe_results():
    report = run_verification(
        service_document(),
        revision_document(),
        frontend_url=FRONTEND_URL,
        request_fn=successful_request,
    )

    assert report["result"] == "PASS"
    assert report["metadata"]["revision"] == REVISION_NAME
    assert report["metadata"]["traffic_percent"] == 100
    assert report["metadata"]["secret_references"] == {
        "MYSCRIPT_APPLICATION_KEY": "verity-myscript-application-key:1",
        "MYSCRIPT_HMAC_KEY": "verity-myscript-hmac-key:1",
    }
    assert report["metadata"]["access_boundary"] == {
        "MYSCRIPT_ALLOW_SHARED_ACCESS": "false",
        "VERITY_AUTH_MODE": "off",
        "VERITY_API_SECRET_CONFIGURED": False,
        "VERITY_GOOGLE_CLIENT_ID_CONFIGURED": False,
        "VERITY_AUTH_ALLOWED_SUBJECTS_CONFIGURED": False,
        "VERITY_AUTH_ALLOWED_EMAILS_CONFIGURED": False,
        "VERITY_AUTH_ALLOWED_DOMAINS_CONFIGURED": False,
    }
    assert report["http"] == {
        "health_status": 200,
        "openapi_status": 200,
        "myscript_route_present": True,
        "disabled_route_status": 404,
        "production_frontend_status": 200,
    }
    assert PRIVATE_SENTINEL not in json.dumps(report)
    assert "frontend content" not in json.dumps(report)


@pytest.mark.parametrize(
    ("overrides", "expected_code"),
    [
        ({"enabled": "true"}, "myscript_enabled_not_false"),
        ({"route_enabled": "true"}, "myscript_poc_route_enabled_not_false"),
        (
            {"shared_access": "true"},
            "myscript_allow_shared_access_not_false",
        ),
        ({"auth_mode": "google"}, "verity_auth_mode_not_off"),
        ({"api_secret": PRIVATE_SENTINEL}, "verity_api_secret_not_empty"),
        (
            {"google_client_id": "configured.apps.googleusercontent.com"},
            "verity_google_client_id_not_empty",
        ),
        (
            {"allowed_subjects": PRIVATE_SENTINEL},
            "verity_auth_allowed_subjects_not_empty",
        ),
        (
            {"allowed_emails": "reviewer@example.edu"},
            "verity_auth_allowed_emails_not_empty",
        ),
        (
            {"allowed_domains": "example.edu"},
            "verity_auth_allowed_domains_not_empty",
        ),
    ],
)
def test_verifier_stops_before_http_when_disabled_access_boundary_drifts(
    overrides, expected_code
):
    def forbidden_request(_url, _data, _headers):
        raise AssertionError("HTTP must not run until both provider flags are false")

    with pytest.raises(VerificationError, match=expected_code):
        run_verification(
            service_document(**overrides),
            revision_document(),
            frontend_url=FRONTEND_URL,
            request_fn=forbidden_request,
        )


def test_verifier_rejects_access_boundary_secret_references_before_http():
    service = service_document()
    client_id = next(
        entry
        for entry in service["spec"]["template"]["spec"]["containers"][0]["env"]
        if entry["name"] == "VERITY_GOOGLE_CLIENT_ID"
    )
    client_id.clear()
    client_id.update(
        {
            "name": "VERITY_GOOGLE_CLIENT_ID",
            "valueFrom": {
                "secretKeyRef": {"name": PRIVATE_SENTINEL, "key": "1"}
            },
        }
    )

    def forbidden_request(_url, _data, _headers):
        raise AssertionError("HTTP must not run until identity metadata is empty")

    with pytest.raises(
        VerificationError, match="verity_google_client_id_not_empty"
    ) as captured:
        run_verification(
            service,
            revision_document(),
            frontend_url=FRONTEND_URL,
            request_fn=forbidden_request,
        )

    assert PRIVATE_SENTINEL not in str(captured.value)


@pytest.mark.parametrize("version", ["", "0", "01", "latest", "1a"])
def test_verifier_rejects_mutable_or_malformed_secret_versions(version):
    with pytest.raises(VerificationError, match="version_not_numeric") as captured:
        validate_service_metadata(
            service_document(version=version),
            revision_document(),
        )

    if version:
        assert version not in str(captured.value)
    assert PRIVATE_SENTINEL not in str(captured.value)


def test_verifier_rejects_direct_secret_values_without_echoing_them():
    service = service_document()
    application_key = next(
        entry
        for entry in service["spec"]["template"]["spec"]["containers"][0]["env"]
        if entry["name"] == "MYSCRIPT_APPLICATION_KEY"
    )
    application_key.clear()
    application_key.update(
        {"name": "MYSCRIPT_APPLICATION_KEY", "value": PRIVATE_SENTINEL}
    )

    with pytest.raises(
        VerificationError, match="myscript_application_key_not_a_secret_reference"
    ) as captured:
        validate_service_metadata(service, revision_document())

    assert PRIVATE_SENTINEL not in str(captured.value)


def test_verifier_requires_ready_revision_to_serve_all_traffic():
    service = service_document()
    service["status"]["traffic"] = [
        {"percent": 90, "revisionName": REVISION_NAME},
        {"percent": 10, "revisionName": "verity-ai-older"},
    ]

    with pytest.raises(
        VerificationError, match="latest_revision_not_serving_all_traffic"
    ):
        validate_service_metadata(service, revision_document())


def test_verifier_rejects_non_disabled_route_response():
    def unsafe_route_request(url, data, headers):
        if url.endswith("/api/handwriting/myscript/recognize"):
            return 200, b'{"text":"provider response"}'
        return successful_request(url, data, headers)

    with pytest.raises(VerificationError, match="disabled_route_check_failed"):
        run_verification(
            service_document(),
            revision_document(),
            frontend_url=FRONTEND_URL,
            request_fn=unsafe_route_request,
        )


def test_cli_failure_output_never_echoes_runtime_values(monkeypatch, capsys):
    service = service_document()
    service["spec"]["template"]["spec"]["containers"][0]["env"][1][
        "value"
    ] = PRIVATE_SENTINEL
    documents = iter([service, revision_document()])
    monkeypatch.setattr(verifier, "_gcloud_json", lambda _args: next(documents))

    assert verifier.main([]) == 1

    captured = capsys.readouterr()
    failure = json.loads(captured.err)
    assert failure == {"code": "myscript_enabled_not_false", "result": "FAIL"}
    assert captured.out == ""
    assert PRIVATE_SENTINEL not in captured.err
