"""Disabled-by-default backend adapter for MyScript iink REST math recognition."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import re
import time
from dataclasses import dataclass, field
from functools import lru_cache
from threading import Lock
from typing import Any, Awaitable, Callable, Protocol
from urllib.parse import urlsplit

import httpx

from handwriting_eval.ledger import (
    MYSCRIPT_POC_ATTEMPT_CAP,
    AttemptLedgerError,
    DurableAttemptLedger,
)
from handwriting_normalization import normalize_expression
from schemas import MyScriptRecognizeRequest


DEFAULT_RECOGNITION_URL = "https://cloud.myscript.com/api/v4.0/iink/recognize"
DEFAULT_TIMEOUT_SECONDS = 3.0
DEFAULT_REQUEST_CAP = MYSCRIPT_POC_ATTEMPT_CAP
MAX_REQUEST_BYTES = 4 * 1024 * 1024
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_PROVIDER_ATTEMPTS = 2
RETRY_DELAY_SECONDS = 0.1
LATEX_ACCEPT = "application/x-latex,application/json"

_SAFE_PROVIDER_CODE_RE = re.compile(r"^[a-z0-9._-]{1,120}$")
_SAFE_LINEAR_EXPRESSION_RE = re.compile(r"^[A-Za-z0-9_+*/^=<>(),.\-\s]*$")


class MyScriptRecognitionError(RuntimeError):
    """A content-safe, typed adapter failure."""

    def __init__(self, code: str, *, retryable: bool = False):
        safe_code = code if _SAFE_PROVIDER_CODE_RE.fullmatch(code) else "adapter_error"
        super().__init__(f"MyScript recognition failed ({safe_code})")
        self.code = safe_code
        self.retryable = retryable


@dataclass(frozen=True, repr=False)
class MyScriptSettings:
    enabled: bool
    application_key: str
    hmac_key: str
    recognition_url: str = DEFAULT_RECOGNITION_URL
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS
    request_cap: int = DEFAULT_REQUEST_CAP
    eval_ledger_path: str = ""
    eval_run_id: str = ""

    def __repr__(self) -> str:
        return (
            "MyScriptSettings("
            f"enabled={self.enabled!r}, "
            f"recognition_url={self.recognition_url!r}, "
            f"timeout_seconds={self.timeout_seconds!r}, "
            f"request_cap={self.request_cap!r}, "
            f"eval_ledger_configured={bool(self.eval_ledger_path and self.eval_run_id)!r}, "
            f"credentials_configured={bool(self.application_key and self.hmac_key)!r})"
        )

    @classmethod
    def from_env(cls) -> "MyScriptSettings":
        enabled = _parse_enabled(os.getenv("MYSCRIPT_ENABLED", "false"))
        recognition_url = os.getenv(
            "MYSCRIPT_RECOGNITION_URL", DEFAULT_RECOGNITION_URL
        ).strip()
        _validate_recognition_url(recognition_url)
        timeout_seconds = _parse_float_env(
            "MYSCRIPT_TIMEOUT_SECONDS",
            os.getenv("MYSCRIPT_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)),
            minimum=0.25,
            maximum=10.0,
        )
        request_cap = _parse_int_env(
            "MYSCRIPT_EVAL_REQUEST_CAP",
            os.getenv("MYSCRIPT_EVAL_REQUEST_CAP", str(DEFAULT_REQUEST_CAP)),
            minimum=1,
            maximum=DEFAULT_REQUEST_CAP,
        )
        application_key = os.getenv("MYSCRIPT_APPLICATION_KEY", "").strip()
        hmac_key = os.getenv("MYSCRIPT_HMAC_KEY", "").strip()
        eval_ledger_path = os.getenv("MYSCRIPT_EVAL_LEDGER_PATH", "").strip()
        eval_run_id = os.getenv("MYSCRIPT_EVAL_RUN_ID", "").strip()
        if enabled and (not application_key or not hmac_key):
            raise MyScriptRecognitionError("credentials_not_configured")
        if enabled and (not eval_ledger_path or not eval_run_id):
            raise MyScriptRecognitionError("request_ledger_not_configured")
        if len(application_key) > 1024 or len(hmac_key) > 1024:
            raise MyScriptRecognitionError("credentials_invalid")
        return cls(
            enabled=enabled,
            application_key=application_key,
            hmac_key=hmac_key,
            recognition_url=recognition_url,
            timeout_seconds=timeout_seconds,
            request_cap=request_cap,
            eval_ledger_path=eval_ledger_path,
            eval_run_id=eval_run_id,
        )


@dataclass(frozen=True, repr=False)
class MyScriptRecognition:
    text: str
    provider_latex: str
    unreadable: bool
    attempts: int
    latency_ms: int


@dataclass
class RequestBudget:
    """Process-local fail-closed counter; every HTTP attempt consumes one slot."""

    cap: int
    _used: int = 0
    _lock: Lock = field(default_factory=Lock, repr=False)

    def reserve(self) -> int:
        with self._lock:
            if self._used >= self.cap:
                raise MyScriptRecognitionError("request_cap_exhausted")
            self._used += 1
            return self._used

    @property
    def used(self) -> int:
        with self._lock:
            return self._used


class AttemptBudget(Protocol):
    def reserve(self) -> int: ...

    @property
    def used(self) -> int: ...


def _parse_enabled(raw_value: str) -> bool:
    value = raw_value.strip().lower()
    if value in {"1", "true"}:
        return True
    if value in {"0", "false", ""}:
        return False
    raise MyScriptRecognitionError("enabled_flag_invalid")


def _parse_float_env(
    name: str, raw_value: str, *, minimum: float, maximum: float
) -> float:
    value: float | None
    try:
        value = float(raw_value)
    except ValueError:
        value = None
    if value is None or not minimum <= value <= maximum:
        raise MyScriptRecognitionError(f"{name.lower()}_invalid")
    return value


def _parse_int_env(
    name: str, raw_value: str, *, minimum: int, maximum: int
) -> int:
    value: int | None
    try:
        value = int(raw_value)
    except ValueError:
        value = None
    if value is None or not minimum <= value <= maximum:
        raise MyScriptRecognitionError(f"{name.lower()}_invalid")
    return value


def _validate_recognition_url(url: str) -> None:
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError:
        parsed = None
        port = None
    if parsed is None or (
        parsed.scheme != "https"
        or parsed.hostname != "cloud.myscript.com"
        or port not in {None, 443}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path.rstrip("/") != "/api/v4.0/iink/recognize"
    ):
        raise MyScriptRecognitionError("recognition_url_invalid")


def _canonical_coordinate(value: float) -> float:
    rounded = round(value, 3)
    return 0.0 if rounded == 0 else rounded


def build_myscript_payload(request: MyScriptRecognizeRequest) -> dict[str, Any]:
    """Convert the versioned VerityAI point model to the official recognize API."""

    all_points = [point for stroke in request.strokes for point in stroke.points]
    min_x = min(point.x for point in all_points)
    min_y = min(point.y for point in all_points)
    strokes: list[dict[str, Any]] = []
    for stroke in request.strokes:
        provider_stroke: dict[str, Any] = {
            "x": [
                _canonical_coordinate(point.x - min_x) for point in stroke.points
            ],
            "y": [
                _canonical_coordinate(point.y - min_y) for point in stroke.points
            ],
        }
        if all(point.t is not None for point in stroke.points):
            provider_stroke["t"] = [
                int(round(point.t)) for point in stroke.points if point.t is not None
            ]
        # MyScript documents pressure as optional and strictly between 0 and 1.
        # Browser mouse/touch events often report exactly 0 or 1, so omit the
        # whole optional array instead of clamping or changing captured ink.
        if all(
            point.p is not None and 0 < point.p < 1 for point in stroke.points
        ):
            pressures = [
                round(point.p, 6) for point in stroke.points if point.p is not None
            ]
            # A value can be inside the documented open interval before
            # rounding and become exactly 0 or 1 afterwards. Omit the optional
            # array in that case rather than send a value outside the contract.
            if all(0 < pressure < 1 for pressure in pressures):
                provider_stroke["p"] = pressures
        strokes.append(provider_stroke)

    return {
        "contentType": "Math",
        "scaleX": round(25.4 / request.dpi_x, 9),
        "scaleY": round(25.4 / request.dpi_y, 9),
        "configuration": {
            "export": {
                "jiix": {
                    "bounding-box": False,
                    "glyphs": False,
                    "ids": False,
                    "math-label": True,
                    "primitives": False,
                    "strokes": False,
                    "style": False,
                }
            },
            "math": {"solver": {"enable": False}},
        },
        "strokes": strokes,
    }


def serialize_myscript_request(request: MyScriptRecognizeRequest) -> bytes:
    body = json.dumps(
        build_myscript_payload(request),
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    if len(body) > MAX_REQUEST_BYTES:
        raise MyScriptRecognitionError("request_body_too_large")
    return body


def compute_myscript_hmac(
    body: bytes, application_key: str, hmac_key: str
) -> str:
    """Sign the exact bytes sent, using application key + HMAC key as the key."""

    signing_key = (application_key + hmac_key).encode("utf-8")
    return hmac.new(signing_key, body, hashlib.sha512).hexdigest()


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate JSON key")
        value[key] = item
    return value


def _strict_json_object(content: bytes) -> dict[str, Any]:
    value: Any = None
    invalid = False
    try:
        value = json.loads(
            content,
            parse_constant=_reject_json_constant,
            object_pairs_hook=_reject_duplicate_keys,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        invalid = True
    if invalid or not isinstance(value, dict):
        raise MyScriptRecognitionError("provider_response_invalid")
    return value


def parse_myscript_jiix(content: bytes) -> tuple[str, str, bool]:
    if len(content) > MAX_RESPONSE_BYTES:
        raise MyScriptRecognitionError("provider_response_too_large")
    value = _strict_json_object(content)
    if value.get("type") != "Math" or not isinstance(value.get("label"), str):
        raise MyScriptRecognitionError("provider_response_invalid")
    provider_latex = value["label"]
    if len(provider_latex) > 10_000:
        raise MyScriptRecognitionError("provider_response_too_large")
    if not provider_latex.strip():
        return "", provider_latex, True

    text = normalize_expression(provider_latex, "latex", "math")
    text = re.sub(r"\s+", " ", text).strip()
    if not text or "\\" in text or not _SAFE_LINEAR_EXPRESSION_RE.fullmatch(text):
        raise MyScriptRecognitionError("unsupported_provider_output")
    return text, provider_latex, False


def parse_myscript_latex(content: bytes) -> tuple[str, str, bool]:
    """Parse the documented Math recognizer response without logging content."""

    if len(content) > MAX_RESPONSE_BYTES:
        raise MyScriptRecognitionError("provider_response_too_large")
    provider_latex: str | None = None
    try:
        provider_latex = content.decode("utf-8")
    except UnicodeDecodeError:
        pass
    # Raise outside the except block so invalid provider bytes cannot survive
    # in an exception context that an upstream logger might serialize.
    if provider_latex is None:
        raise MyScriptRecognitionError("provider_response_invalid")
    if len(provider_latex) > 10_000:
        raise MyScriptRecognitionError("provider_response_too_large")
    if not provider_latex.strip():
        return "", provider_latex, True

    text = normalize_expression(provider_latex, "latex", "math")
    text = re.sub(r"\s+", " ", text).strip()
    if not text or "\\" in text or not _SAFE_LINEAR_EXPRESSION_RE.fullmatch(text):
        raise MyScriptRecognitionError("unsupported_provider_output")
    return text, provider_latex, False


def _safe_provider_error_code(response: httpx.Response) -> str | None:
    if len(response.content) > MAX_RESPONSE_BYTES:
        return None
    try:
        value = _strict_json_object(response.content)
    except MyScriptRecognitionError:
        return None
    code = value.get("code")
    if isinstance(code, str) and _SAFE_PROVIDER_CODE_RE.fullmatch(code):
        return code
    return None


def _status_error(response: httpx.Response) -> MyScriptRecognitionError:
    status = response.status_code
    provider_code = _safe_provider_error_code(response)
    if status == 400:
        return MyScriptRecognitionError("provider_rejected_input")
    if status == 401:
        return MyScriptRecognitionError("provider_authentication")
    if status == 403:
        quota_markers = ("quota", "counter", "cartridge", "threshold")
        if provider_code and any(marker in provider_code for marker in quota_markers):
            return MyScriptRecognitionError("provider_quota_exhausted")
        return MyScriptRecognitionError("provider_access_denied")
    if status == 413:
        return MyScriptRecognitionError("provider_payload_too_large")
    if status in {408, 429}:
        code = "provider_timeout" if status == 408 else "provider_rate_limited"
        return MyScriptRecognitionError(code, retryable=True)
    if 500 <= status <= 599:
        return MyScriptRecognitionError("provider_unavailable", retryable=True)
    return MyScriptRecognitionError("provider_http_error")


async def _read_bounded_response(response: httpx.Response) -> bytes:
    """Read at most the accepted JIIX size, without buffering an unbounded body."""

    content_length = response.headers.get("content-length")
    if content_length is not None:
        declared_size: int | None
        try:
            declared_size = int(content_length)
        except ValueError:
            declared_size = None
        if declared_size is None or declared_size < 0:
            raise MyScriptRecognitionError("provider_response_invalid")
        if declared_size > MAX_RESPONSE_BYTES:
            raise MyScriptRecognitionError("provider_response_too_large")

    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        size += len(chunk)
        if size > MAX_RESPONSE_BYTES:
            raise MyScriptRecognitionError("provider_response_too_large")
        chunks.append(chunk)
    return b"".join(chunks)


async def _post_bounded(
    client: httpx.AsyncClient,
    url: str,
    *,
    body: bytes,
    headers: dict[str, str],
) -> httpx.Response:
    async with client.stream(
        "POST",
        url,
        content=body,
        headers=headers,
    ) as response:
        content = await _read_bounded_response(response)
        return httpx.Response(
            response.status_code,
            headers=response.headers,
            content=content,
            request=response.request,
        )


class MyScriptRecognizer:
    def __init__(
        self,
        settings: MyScriptSettings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        sleeper: Callable[[float], Awaitable[None]] = asyncio.sleep,
        budget: AttemptBudget | None = None,
    ):
        self.settings = settings
        self.transport = transport
        self.sleeper = sleeper
        self.budget = budget or RequestBudget(settings.request_cap)

    def _reserve_attempt(self) -> None:
        failure: MyScriptRecognitionError | None = None
        try:
            self.budget.reserve()
        except AttemptLedgerError as exc:
            failure = MyScriptRecognitionError(
                exc.code
                if exc.code == "request_cap_exhausted"
                else "request_ledger_unavailable"
            )
        if failure is not None:
            raise failure

    async def recognize(
        self, request: MyScriptRecognizeRequest
    ) -> MyScriptRecognition:
        if not self.settings.enabled:
            raise MyScriptRecognitionError("disabled")
        if not self.settings.application_key or not self.settings.hmac_key:
            raise MyScriptRecognitionError("credentials_not_configured")

        body = serialize_myscript_request(request)
        signature = compute_myscript_hmac(
            body,
            self.settings.application_key,
            self.settings.hmac_key,
        )
        headers = {
            "Accept": LATEX_ACCEPT,
            "Content-Type": "application/json",
            "applicationKey": self.settings.application_key,
            "hmac": signature,
            "myscript-client-name": "verity-ai",
            "myscript-client-version": "poc-v1",
        }
        timeout = httpx.Timeout(
            self.settings.timeout_seconds,
            connect=min(1.0, self.settings.timeout_seconds),
        )
        started_at = time.perf_counter()
        attempts = 0

        async with httpx.AsyncClient(
            timeout=timeout,
            transport=self.transport,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            while attempts < MAX_PROVIDER_ATTEMPTS:
                self._reserve_attempt()
                attempts += 1
                transport_failure: MyScriptRecognitionError | None = None
                try:
                    response = await _post_bounded(
                        client,
                        self.settings.recognition_url,
                        body=body,
                        headers=headers,
                    )
                except httpx.TimeoutException:
                    transport_failure = MyScriptRecognitionError(
                        "provider_timeout", retryable=True
                    )
                except httpx.TransportError:
                    transport_failure = MyScriptRecognitionError(
                        "provider_transport_error", retryable=True
                    )

                # Raise after leaving the except block. This keeps the original
                # httpx exception -- whose request carries authentication
                # headers -- out of both __cause__ and __context__.
                if transport_failure is not None:
                    if attempts < MAX_PROVIDER_ATTEMPTS:
                        await self.sleeper(RETRY_DELAY_SECONDS)
                        continue
                    raise transport_failure

                if response.status_code == 200:
                    media_type = response.headers.get("content-type", "").split(
                        ";", 1
                    )[0].strip().lower()
                    if media_type != "application/x-latex":
                        raise MyScriptRecognitionError(
                            "provider_response_content_type_invalid"
                        )
                    text, provider_latex, unreadable = parse_myscript_latex(
                        response.content
                    )
                    latency_ms = max(
                        0, round((time.perf_counter() - started_at) * 1000)
                    )
                    return MyScriptRecognition(
                        text=text,
                        provider_latex=provider_latex,
                        unreadable=unreadable,
                        attempts=attempts,
                        latency_ms=latency_ms,
                    )

                failure = _status_error(response)
                if failure.retryable and attempts < MAX_PROVIDER_ATTEMPTS:
                    await self.sleeper(RETRY_DELAY_SECONDS)
                    continue
                raise failure

        raise MyScriptRecognitionError("provider_unavailable", retryable=True)


@lru_cache(maxsize=1)
def get_myscript_recognizer() -> MyScriptRecognizer:
    settings = MyScriptSettings.from_env()
    budget: AttemptBudget | None = None
    if settings.enabled:
        try:
            budget = DurableAttemptLedger(
                settings.eval_ledger_path,
                run_id=settings.eval_run_id,
                provider="myscript",
                request_cap=settings.request_cap,
            )
        except AttemptLedgerError:
            raise MyScriptRecognitionError("request_ledger_unavailable") from None
    return MyScriptRecognizer(settings, budget=budget)
