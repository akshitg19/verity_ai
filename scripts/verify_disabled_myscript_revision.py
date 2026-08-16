#!/usr/bin/env python3
"""Verify a fail-closed MyScript Cloud Run revision without reading secrets."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Sequence
from typing import Any


DEFAULT_PROJECT = "cs-sail-2b08"
DEFAULT_REGION = "us-central1"
DEFAULT_SERVICE = "verity-ai"
DEFAULT_RUNTIME_SERVICE_ACCOUNT = (
    "verity-ai-run@cs-sail-2b08.iam.gserviceaccount.com"
)
DEFAULT_FRONTEND_URL = "https://verity-ai-lovat.vercel.app"
MAX_HTTP_BODY_BYTES = 4 * 1024 * 1024
POSITIVE_VERSION = re.compile(r"^[1-9][0-9]*$")

EXPECTED_SECRET_NAMES = {
    "MYSCRIPT_APPLICATION_KEY": "verity-myscript-application-key",
    "MYSCRIPT_HMAC_KEY": "verity-myscript-hmac-key",
}
DISABLED_DETAILS = {"Not Found", "MyScript recognition is disabled"}


class VerificationError(RuntimeError):
    """A content-safe verification failure with a stable operator code."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _validated_https_base_url(
    value: str, *, hostname_suffix: str | None = None
) -> str:
    try:
        parsed = urllib.parse.urlsplit(value)
        port = parsed.port
    except (TypeError, ValueError):
        raise VerificationError("service_url_invalid") from None
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 443}
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
        or (
            hostname_suffix is not None
            and not parsed.hostname.endswith(hostname_suffix)
        )
    ):
        raise VerificationError("service_url_invalid")
    return value.rstrip("/")


def _single_env(entries: list[dict[str, Any]], name: str) -> dict[str, Any]:
    matches = [entry for entry in entries if entry.get("name") == name]
    if len(matches) != 1:
        raise VerificationError(f"{name.lower()}_missing_or_duplicate")
    return matches[0]


def validate_service_metadata(
    service: dict[str, Any],
    revision: dict[str, Any],
    *,
    expected_service_account: str = DEFAULT_RUNTIME_SERVICE_ACCOUNT,
) -> dict[str, Any]:
    """Return only allowlisted metadata after every disabled-state check passes."""

    try:
        status = service["status"]
        template = service["spec"]["template"]["spec"]
        container = template["containers"][0]
        entries = container["env"]
        latest_ready = status["latestReadyRevisionName"]
        latest_created = status["latestCreatedRevisionName"]
        service_url = status["url"]
        service_account = template["serviceAccountName"]
        image = container["image"]
        traffic = status["traffic"]
        revision_name = revision["metadata"]["name"]
        image_digest = revision["status"]["imageDigest"]
    except (KeyError, IndexError, TypeError):
        raise VerificationError("runtime_metadata_incomplete") from None

    if not isinstance(entries, list) or not all(
        isinstance(entry, dict) for entry in entries
    ):
        raise VerificationError("runtime_environment_invalid")
    if (
        not isinstance(latest_ready, str)
        or latest_ready != latest_created
        or latest_ready != revision_name
    ):
        raise VerificationError("revision_not_ready")
    if service_account != expected_service_account:
        raise VerificationError("runtime_service_account_unexpected")
    service_url = _validated_https_base_url(
        service_url, hostname_suffix=".run.app"
    )
    if not isinstance(image, str) or not image:
        raise VerificationError("revision_image_missing")
    if not isinstance(image_digest, str) or "@sha256:" not in image_digest:
        raise VerificationError("revision_digest_missing")

    for flag in ("MYSCRIPT_ENABLED", "MYSCRIPT_POC_ROUTE_ENABLED"):
        entry = _single_env(entries, flag)
        if entry.get("value") != "false" or entry.get("valueFrom"):
            raise VerificationError(f"{flag.lower()}_not_false")

    secret_references: dict[str, str] = {}
    for env_name, expected_secret in EXPECTED_SECRET_NAMES.items():
        entry = _single_env(entries, env_name)
        direct_value = entry.get("value")
        if direct_value is not None and direct_value != "":
            raise VerificationError(f"{env_name.lower()}_not_a_secret_reference")
        try:
            reference = entry["valueFrom"]["secretKeyRef"]
            secret_name = reference["name"]
            version = reference["key"]
        except (KeyError, TypeError):
            raise VerificationError(
                f"{env_name.lower()}_secret_reference_invalid"
            ) from None
        if secret_name != expected_secret:
            raise VerificationError(f"{env_name.lower()}_secret_name_unexpected")
        if not isinstance(version, str) or not POSITIVE_VERSION.fullmatch(version):
            raise VerificationError(f"{env_name.lower()}_version_not_numeric")
        secret_references[env_name] = f"{secret_name}:{version}"

    if not isinstance(traffic, list):
        raise VerificationError("traffic_metadata_invalid")
    total_percent = 0
    ready_percent = 0
    for target in traffic:
        if not isinstance(target, dict):
            raise VerificationError("traffic_metadata_invalid")
        percent = target.get("percent", 0)
        if not isinstance(percent, int) or isinstance(percent, bool):
            raise VerificationError("traffic_metadata_invalid")
        total_percent += percent
        if target.get("revisionName") == latest_ready:
            ready_percent += percent
    if total_percent != 100 or ready_percent != 100:
        raise VerificationError("latest_revision_not_serving_all_traffic")

    return {
        "revision": latest_ready,
        "service_url": service_url,
        "service_account": service_account,
        "image": image,
        "image_digest": image_digest,
        "traffic_percent": ready_percent,
        "flags": {
            "MYSCRIPT_ENABLED": "false",
            "MYSCRIPT_POC_ROUTE_ENABLED": "false",
        },
        "secret_references": secret_references,
    }


def _fetch(
    url: str, data: bytes | None, headers: dict[str, str]
) -> tuple[int, bytes]:
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read(MAX_HTTP_BODY_BYTES + 1)
            status = response.status
    except urllib.error.HTTPError as exc:
        body = exc.read(MAX_HTTP_BODY_BYTES + 1)
        status = exc.code
    except (OSError, urllib.error.URLError):
        raise VerificationError("http_check_unavailable") from None
    if len(body) > MAX_HTTP_BODY_BYTES:
        raise VerificationError("http_response_too_large")
    return status, body


RequestFunction = Callable[
    [str, bytes | None, dict[str, str]], tuple[int, bytes]
]


def verify_content_safe_http(
    service_url: str,
    frontend_url: str,
    *,
    request_fn: RequestFunction = _fetch,
) -> dict[str, Any]:
    """Run only content-safe checks after metadata proves provider flags false."""

    service_url = _validated_https_base_url(
        service_url, hostname_suffix=".run.app"
    )
    frontend_url = _validated_https_base_url(frontend_url)

    health_status, health_body = request_fn(service_url + "/health", None, {})
    try:
        health = json.loads(health_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise VerificationError("health_response_invalid") from None
    if health_status != 200 or health != {"status": "ok"}:
        raise VerificationError("health_check_failed")

    openapi_status, openapi_body = request_fn(
        service_url + "/openapi.json", None, {}
    )
    try:
        openapi = json.loads(openapi_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise VerificationError("openapi_response_invalid") from None
    if openapi_status != 200 or not isinstance(openapi, dict):
        raise VerificationError("openapi_check_failed")
    paths = openapi.get("paths")
    if (
        not isinstance(paths, dict)
        or "/handwriting/myscript/recognize" not in paths
    ):
        raise VerificationError("myscript_route_missing")

    synthetic_payload = json.dumps(
        {
            "schema_version": 1,
            "profile": "linear-equation-v1",
            "strokes": [
                {
                    "id": "synthetic-disabled-check",
                    "pointer_type": "synthetic",
                    "points": [{"x": 0, "y": 0, "t": 0}],
                }
            ],
        },
        separators=(",", ":"),
    ).encode("ascii")
    route_status, route_body = request_fn(
        service_url + "/api/handwriting/myscript/recognize",
        synthetic_payload,
        {"Content-Type": "application/json"},
    )
    try:
        route_response = json.loads(route_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise VerificationError("disabled_route_response_invalid") from None
    if (
        route_status != 404
        or not isinstance(route_response, dict)
        or route_response.get("detail") not in DISABLED_DETAILS
    ):
        raise VerificationError("disabled_route_check_failed")

    frontend_status, _frontend_body = request_fn(
        frontend_url.rstrip("/") + "/", None, {}
    )
    if frontend_status != 200:
        raise VerificationError("production_frontend_check_failed")

    return {
        "health_status": health_status,
        "openapi_status": openapi_status,
        "myscript_route_present": True,
        "disabled_route_status": route_status,
        "production_frontend_status": frontend_status,
    }


def run_verification(
    service: dict[str, Any],
    revision: dict[str, Any],
    *,
    frontend_url: str = DEFAULT_FRONTEND_URL,
    expected_service_account: str = DEFAULT_RUNTIME_SERVICE_ACCOUNT,
    request_fn: RequestFunction = _fetch,
) -> dict[str, Any]:
    metadata = validate_service_metadata(
        service,
        revision,
        expected_service_account=expected_service_account,
    )
    http = verify_content_safe_http(
        metadata["service_url"],
        frontend_url,
        request_fn=request_fn,
    )
    return {"result": "PASS", "metadata": metadata, "http": http}


def _gcloud_json(args: list[str]) -> dict[str, Any]:
    completed = subprocess.run(
        ["gcloud", *args, "--format=json"],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise VerificationError("gcloud_metadata_unavailable")
    try:
        document = json.loads(completed.stdout)
    except json.JSONDecodeError:
        raise VerificationError("gcloud_metadata_invalid") from None
    if not isinstance(document, dict):
        raise VerificationError("gcloud_metadata_invalid")
    return document


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Verify a disabled MyScript Cloud Run revision without accessing "
            "Secret Manager values or making a provider request."
        )
    )
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--frontend-url", default=DEFAULT_FRONTEND_URL)
    parser.add_argument(
        "--expected-service-account",
        default=DEFAULT_RUNTIME_SERVICE_ACCOUNT,
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        service = _gcloud_json(
            [
                "run",
                "services",
                "describe",
                args.service,
                f"--project={args.project}",
                f"--region={args.region}",
            ]
        )
        try:
            revision_name = service["status"]["latestReadyRevisionName"]
        except (KeyError, TypeError):
            raise VerificationError("runtime_metadata_incomplete") from None
        if not isinstance(revision_name, str) or not revision_name:
            raise VerificationError("runtime_metadata_incomplete")
        revision = _gcloud_json(
            [
                "run",
                "revisions",
                "describe",
                revision_name,
                f"--project={args.project}",
                f"--region={args.region}",
            ]
        )
        report = run_verification(
            service,
            revision,
            frontend_url=args.frontend_url,
            expected_service_account=args.expected_service_account,
        )
    except VerificationError as exc:
        print(
            json.dumps({"result": "FAIL", "code": exc.code}, sort_keys=True),
            file=sys.stderr,
        )
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
