import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from judge import MathJudgeDispatcher
from myscript_recognition import (
    MyScriptRecognition,
    MyScriptRecognitionError,
    MyScriptRecognizer,
    MyScriptSettings,
    RequestBudget,
    build_myscript_payload,
    compute_myscript_hmac,
    parse_myscript_jiix,
    serialize_myscript_request,
)
from schemas import MyScriptRecognizeRequest, Step


SYNTHETIC_APPLICATION_KEY = "test-application-key"
SYNTHETIC_HMAC_KEY = "test-hmac-key"


def recognize_request(*, times=(100.4, 101.6), pressures=(0.0, 0.5)):
    return MyScriptRecognizeRequest(
        schema_version=1,
        profile="linear-equation-v1",
        strokes=[
            {
                "id": "local-stroke-1",
                "pointer_type": "pen",
                "points": [
                    {"x": 10, "y": 30, "t": times[0], "p": pressures[0]},
                    {"x": 12.25, "y": 32.5, "t": times[1], "p": pressures[1]},
                ],
            },
            {
                "id": "local-stroke-2",
                "pointer_type": "mouse",
                "points": [
                    {"x": 20, "y": 25, "t": 200, "p": 0.5},
                    {"x": 21, "y": 26, "t": 201, "p": 0.6},
                ],
            },
        ],
    )


def settings(*, enabled=True, request_cap=650):
    return MyScriptSettings(
        enabled=enabled,
        application_key=SYNTHETIC_APPLICATION_KEY,
        hmac_key=SYNTHETIC_HMAC_KEY,
        request_cap=request_cap,
    )


def success_response(label=r"\frac{x}{2} = 3"):
    return httpx.Response(
        200,
        headers={"Content-Type": "application/vnd.myscript.jiix"},
        json={"type": "Math", "label": label},
    )


def test_build_payload_matches_recognizer_shape_without_identifiers_or_raw_pressure():
    payload = build_myscript_payload(recognize_request())

    assert payload["contentType"] == "Math"
    assert payload["scaleX"] == pytest.approx(25.4 / 96)
    assert payload["scaleY"] == pytest.approx(25.4 / 96)
    assert payload["strokes"] == [
        {
            "x": [0.0, 2.25],
            "y": [5.0, 7.5],
            "t": [100, 102],
        },
        {
            "x": [10.0, 11.0],
            "y": [0.0, 1.0],
            "t": [200, 201],
            "p": [0.5, 0.6],
        },
    ]
    assert payload["configuration"]["export"]["jiix"]["strokes"] is False
    assert payload["configuration"]["export"]["jiix"]["math-label"] is True
    assert payload["configuration"]["math"]["solver"]["enable"] is False
    serialized = json.dumps(payload)
    assert "local-stroke" not in serialized
    assert "pointer" not in serialized


def test_pressure_that_rounds_to_an_invalid_endpoint_is_omitted():
    payload = build_myscript_payload(
        recognize_request(pressures=(0.0000001, 0.5))
    )

    assert "p" not in payload["strokes"][0]


def test_compute_hmac_matches_fixed_sha512_vector():
    body = b'{"synthetic":true}'

    assert compute_myscript_hmac(
        body, SYNTHETIC_APPLICATION_KEY, SYNTHETIC_HMAC_KEY
    ) == (
        "0aded2622156dc910eb0f51403a9b491aff4f1ae0797c2e515a3996784169ea04"
        "cf1fd49fec70c5820ed4ec0c86980d55cb523b88d2e010d7dfd2819f213c6a6"
    )


def test_recognizer_sends_the_signed_exact_body_and_returns_normalized_math():
    request = recognize_request()
    expected_body = serialize_myscript_request(request)
    seen = []

    def handler(provider_request):
        seen.append(provider_request)
        assert provider_request.content == expected_body
        assert provider_request.headers["applicationKey"] == SYNTHETIC_APPLICATION_KEY
        assert provider_request.headers["hmac"] == compute_myscript_hmac(
            expected_body,
            SYNTHETIC_APPLICATION_KEY,
            SYNTHETIC_HMAC_KEY,
        )
        assert provider_request.headers["Accept"] == (
            "application/vnd.myscript.jiix,application/json"
        )
        return success_response()

    recognizer = MyScriptRecognizer(
        settings(), transport=httpx.MockTransport(handler)
    )
    result = asyncio.run(recognizer.recognize(request))

    assert len(seen) == 1
    assert result.text == "(x)/(2)=3"
    assert result.provider_latex == r"\frac{x}{2} = 3"
    assert result.unreadable is False
    assert result.attempts == 1
    assert recognizer.budget.used == 1


def test_transient_response_retries_once_and_counts_both_attempts():
    calls = 0
    sleeps = []

    def handler(_request):
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(500, json={"code": "internal.error"})
        return success_response("x = 3")

    async def fake_sleep(delay):
        sleeps.append(delay)

    recognizer = MyScriptRecognizer(
        settings(request_cap=2),
        transport=httpx.MockTransport(handler),
        sleeper=fake_sleep,
    )
    result = asyncio.run(recognizer.recognize(recognize_request()))

    assert result.text == "x=3"
    assert result.attempts == 2
    assert calls == 2
    assert recognizer.budget.used == 2
    assert sleeps == [0.1]


def test_authentication_failure_is_typed_and_not_retried():
    calls = 0

    def handler(_request):
        nonlocal calls
        calls += 1
        return httpx.Response(
            401,
            json={"code": "access.not.granted", "message": "sensitive detail"},
        )

    recognizer = MyScriptRecognizer(
        settings(), transport=httpx.MockTransport(handler)
    )

    with pytest.raises(MyScriptRecognitionError) as captured:
        asyncio.run(recognizer.recognize(recognize_request()))

    assert captured.value.code == "provider_authentication"
    assert "sensitive detail" not in str(captured.value)
    assert calls == 1


def test_transport_failure_does_not_retain_request_with_authentication_headers():
    def handler(provider_request):
        raise httpx.ConnectError(
            "private transport detail",
            request=provider_request,
        )

    recognizer = MyScriptRecognizer(
        settings(request_cap=2),
        transport=httpx.MockTransport(handler),
        sleeper=AsyncMock(),
    )

    with pytest.raises(MyScriptRecognitionError) as captured:
        asyncio.run(recognizer.recognize(recognize_request()))

    assert captured.value.code == "provider_transport_error"
    assert captured.value.__cause__ is None
    assert captured.value.__context__ is None
    assert SYNTHETIC_APPLICATION_KEY not in str(captured.value)
    assert SYNTHETIC_HMAC_KEY not in str(captured.value)


def test_request_cap_stops_before_an_unbudgeted_retry():
    calls = 0

    def handler(_request):
        nonlocal calls
        calls += 1
        return httpx.Response(500, json={"code": "internal.error"})

    recognizer = MyScriptRecognizer(
        settings(request_cap=1),
        transport=httpx.MockTransport(handler),
        sleeper=AsyncMock(),
    )

    with pytest.raises(MyScriptRecognitionError) as captured:
        asyncio.run(recognizer.recognize(recognize_request()))

    assert captured.value.code == "request_cap_exhausted"
    assert calls == 1
    assert recognizer.budget.used == 1


def test_disabled_adapter_never_opens_the_transport():
    def handler(_request):
        raise AssertionError("disabled adapter must not make a provider request")

    recognizer = MyScriptRecognizer(
        settings(enabled=False), transport=httpx.MockTransport(handler)
    )

    with pytest.raises(MyScriptRecognitionError) as captured:
        asyncio.run(recognizer.recognize(recognize_request()))

    assert captured.value.code == "disabled"
    assert recognizer.budget.used == 0


def test_invalid_jiix_does_not_echo_provider_content():
    private_content = "student-private-output"
    body = json.dumps(
        {"type": "Math", "label": {"unexpected": private_content}}
    ).encode("utf-8")

    with pytest.raises(MyScriptRecognitionError) as captured:
        parse_myscript_jiix(body)

    assert captured.value.code == "provider_response_invalid"
    assert private_content not in str(captured.value)
    assert captured.value.__cause__ is None
    assert captured.value.__context__ is None


def test_normalized_linear_fraction_is_accepted_by_deterministic_judge():
    text, _provider_latex, unreadable = parse_myscript_jiix(
        json.dumps({"type": "Math", "label": r"\frac{x}{2} = 3"}).encode(
            "utf-8"
        )
    )

    verdict = MathJudgeDispatcher().check(
        "algebra",
        "x/2 = 3",
        [Step(line_number=1, latex=text)],
    )[0]

    assert unreadable is False
    assert verdict.valid is True


def test_success_with_unexpected_content_type_is_rejected():
    def handler(_request):
        return httpx.Response(
            200,
            headers={"Content-Type": "text/plain"},
            content=b"not jiix",
        )

    recognizer = MyScriptRecognizer(
        settings(), transport=httpx.MockTransport(handler)
    )

    with pytest.raises(MyScriptRecognitionError) as captured:
        asyncio.run(recognizer.recognize(recognize_request()))

    assert captured.value.code == "provider_response_content_type_invalid"


def test_declared_oversized_provider_response_is_rejected_before_parsing():
    def handler(_request):
        return httpx.Response(
            200,
            headers={
                "Content-Type": "application/vnd.myscript.jiix",
                "Content-Length": str(2 * 1024 * 1024 + 1),
            },
            content=b"{}",
        )

    recognizer = MyScriptRecognizer(
        settings(), transport=httpx.MockTransport(handler)
    )

    with pytest.raises(MyScriptRecognitionError) as captured:
        asyncio.run(recognizer.recognize(recognize_request()))

    assert captured.value.code == "provider_response_too_large"


def test_settings_are_fail_closed_and_repr_redacts_credentials(monkeypatch):
    monkeypatch.setenv("MYSCRIPT_ENABLED", "true")
    monkeypatch.setenv("MYSCRIPT_APPLICATION_KEY", SYNTHETIC_APPLICATION_KEY)
    monkeypatch.setenv("MYSCRIPT_HMAC_KEY", SYNTHETIC_HMAC_KEY)
    configured = MyScriptSettings.from_env()

    rendered = repr(configured)
    assert "credentials_configured=True" in rendered
    assert SYNTHETIC_APPLICATION_KEY not in rendered
    assert SYNTHETIC_HMAC_KEY not in rendered

    monkeypatch.setenv(
        "MYSCRIPT_RECOGNITION_URL", "https://example.invalid/api/v4.0/iink/recognize/"
    )
    with pytest.raises(MyScriptRecognitionError, match="recognition_url_invalid"):
        MyScriptSettings.from_env()

    monkeypatch.setenv("MYSCRIPT_RECOGNITION_URL", settings().recognition_url)
    monkeypatch.delenv("MYSCRIPT_HMAC_KEY")
    with pytest.raises(
        MyScriptRecognitionError, match="credentials_not_configured"
    ):
        MyScriptSettings.from_env()


def test_api_route_returns_normalized_contract_without_raw_jiix():
    fake = AsyncMock()
    fake.recognize.return_value = MyScriptRecognition(
        text="x=3",
        provider_latex=r"x = 3",
        unreadable=False,
        attempts=1,
        latency_ms=41,
    )
    payload = recognize_request().model_dump(mode="json")

    with (
        patch("main._myscript_poc_route_is_enabled", return_value=True),
        patch("main.get_myscript_recognizer", return_value=fake),
    ):
        response = TestClient(main.app).post(
            "/handwriting/myscript/recognize", json=payload
        )

    assert response.status_code == 200
    assert response.json() == {
        "text": "x=3",
        "unreadable": False,
        "format": "ascii",
        "source": "myscript",
        "provisional": False,
        "candidates": ["x=3"],
        "latency_ms": 41,
    }
    assert "provider_latex" not in response.text


@pytest.mark.parametrize(
    ("code", "expected_status", "expected_detail"),
    [
        ("disabled", 404, "MyScript recognition is disabled"),
        ("provider_timeout", 504, "Vector recognition timed out"),
        (
            "provider_authentication",
            503,
            "Vector recognition is temporarily unavailable",
        ),
        (
            "request_cap_exhausted",
            429,
            "Vector recognition budget is unavailable",
        ),
        (
            "unsupported_provider_output",
            422,
            "Handwriting input is not supported",
        ),
    ],
)
def test_api_route_maps_typed_errors_without_provider_details(
    code, expected_status, expected_detail
):
    fake = AsyncMock()
    fake.recognize.side_effect = MyScriptRecognitionError(
        code, retryable=code == "provider_timeout"
    )

    with (
        patch("main._myscript_poc_route_is_enabled", return_value=True),
        patch("main.get_myscript_recognizer", return_value=fake),
    ):
        response = TestClient(main.app).post(
            "/handwriting/myscript/recognize",
            json=recognize_request().model_dump(mode="json"),
        )

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}


def test_api_rejects_non_monotonic_timestamps_before_adapter_call():
    fake = AsyncMock()
    payload = recognize_request().model_dump(mode="json")
    payload["strokes"][0]["points"][0]["t"] = 2
    payload["strokes"][0]["points"][1]["t"] = 1

    with (
        patch("main._myscript_poc_route_is_enabled", return_value=True),
        patch("main.get_myscript_recognizer", return_value=fake),
    ):
        response = TestClient(main.app).post(
            "/handwriting/myscript/recognize",
            json=payload,
        )

    assert response.status_code == 422
    fake.recognize.assert_not_awaited()


def test_api_route_gate_stops_before_adapter_lookup():
    payload = recognize_request().model_dump(mode="json")

    with (
        patch("main._myscript_poc_route_is_enabled", return_value=False),
        patch("main.get_myscript_recognizer") as get_recognizer,
    ):
        response = TestClient(main.app).post(
            "/handwriting/myscript/recognize", json=payload
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "MyScript recognition is disabled"}
    get_recognizer.assert_not_called()


def test_route_gate_requires_both_explicit_flag_and_api_access_control(monkeypatch):
    monkeypatch.setenv("MYSCRIPT_POC_ROUTE_ENABLED", "true")
    with patch.object(main, "API_SECRET", ""):
        assert main._myscript_poc_route_is_enabled() is False
    with patch.object(main, "API_SECRET", "configured-access-control"):
        assert main._myscript_poc_route_is_enabled() is True

    monkeypatch.setenv("MYSCRIPT_POC_ROUTE_ENABLED", "false")
    with patch.object(main, "API_SECRET", "configured-access-control"):
        assert main._myscript_poc_route_is_enabled() is False


def test_cloud_build_maps_existing_secrets_with_provider_disabled():
    repository_root = Path(__file__).resolve().parents[2]
    cloudbuild = (repository_root / "cloudbuild.yaml").read_text(encoding="utf-8")
    deploy_script = (repository_root / "deploy.ps1").read_text(encoding="utf-8")

    assert "MYSCRIPT_ENABLED=false" in cloudbuild
    assert "MYSCRIPT_POC_ROUTE_ENABLED=false" in cloudbuild
    assert (
        "MYSCRIPT_APPLICATION_KEY=verity-myscript-application-key:"
        "${_MYSCRIPT_APPLICATION_KEY_VERSION}" in cloudbuild
    )
    assert (
        "MYSCRIPT_HMAC_KEY=verity-myscript-hmac-key:"
        "${_MYSCRIPT_HMAC_KEY_VERSION}" in cloudbuild
    )
    assert "MYSCRIPT_APPLICATION_KEY=${" not in cloudbuild
    assert "gcloud secrets describe" in deploy_script
    assert "secrets versions access" not in deploy_script.lower()
    assert ".secrets/myscript.env" not in deploy_script
