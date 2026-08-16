"""Controlled synthetic-only MyScript smoke runner.

Raw provider outputs and fixture identifiers are written only to an owner-only
prediction artifact. Standard output is deliberately content-free.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any

from myscript_recognition import (
    MyScriptRecognitionError,
    MyScriptRecognizer,
    MyScriptSettings,
    serialize_myscript_request,
)
from judge.algebra import _parse_equation
from handwriting_normalization import NORMALIZATION_VERSION
from schemas import MyScriptRecognizeRequest

from .ledger import AttemptLedgerError, DurableAttemptLedger
from .validation import (
    EvaluationDataError,
    load_manifest,
    load_predictions,
    write_restricted_jsonl,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_SCHEMA = REPO_ROOT / "docs/handwriting/fixtures/fixture.schema.json"
STROKE_SCHEMA = REPO_ROOT / "docs/handwriting/fixtures/stroke.schema.json"
PREDICTION_SCHEMA = REPO_ROOT / "docs/handwriting/fixtures/prediction.schema.json"
MAX_SYNTHETIC_POC_ATTEMPTS = 50
PROVIDER = "myscript"
MODEL = "iink-recognize-v4"
CONFIGURATION_ID = "math-latex-rest-v1"

_STOP_RUN_CODES = {
    "credentials_not_configured",
    "provider_authentication",
    "provider_access_denied",
    "provider_quota_exhausted",
    "request_cap_exhausted",
    "request_ledger_unavailable",
}


def _safe_error(code: str) -> tuple[str, str]:
    if code == "provider_timeout":
        return "timeout", "timeout"
    if code == "provider_rate_limited":
        return "error", "rate_limited"
    if code in {"provider_quota_exhausted", "request_cap_exhausted"}:
        return "error", "quota_exhausted"
    if code == "provider_authentication":
        return "error", "authentication"
    if code in {
        "provider_rejected_input",
        "provider_payload_too_large",
        "request_body_too_large",
        "unsupported_provider_output",
    }:
        return "error", "invalid_request"
    if code in {"provider_unavailable", "provider_transport_error"}:
        return "error", "service_unavailable"
    if code.startswith("provider_"):
        return "error", "provider_error"
    return "error", "adapter_error"


def _prediction_base(fixture_id: str, run_id: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "fixture_id": fixture_id,
        "run_id": run_id,
        "provider": PROVIDER,
        "model": MODEL,
        "configuration_id": CONFIGURATION_ID,
        "normalization_version": NORMALIZATION_VERSION,
        "benchmark_eligible": True,
    }


def _judge_parse_success(text: str, unreadable: bool) -> bool:
    if unreadable or not text:
        return False
    try:
        _parse_equation(text)
    except Exception:
        return False
    return True


def _load_strokes(fixture_root: Path, relative_path: str) -> dict[str, Any]:
    path = fixture_root.joinpath(*relative_path.split("/"))
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EvaluationDataError("Could not load validated synthetic strokes") from exc


def _settings(request_cap: int, ledger_path: Path, run_id: str) -> MyScriptSettings:
    application_key = os.getenv("MYSCRIPT_APPLICATION_KEY", "").strip()
    hmac_key = os.getenv("MYSCRIPT_HMAC_KEY", "").strip()
    if not application_key or not hmac_key:
        raise EvaluationDataError("MyScript credentials are not configured")
    if len(application_key) > 1024 or len(hmac_key) > 1024:
        raise EvaluationDataError("MyScript credentials are invalid")
    return MyScriptSettings(
        enabled=True,
        application_key=application_key,
        hmac_key=hmac_key,
        timeout_seconds=3.0,
        request_cap=request_cap,
        eval_ledger_path=str(ledger_path),
        eval_run_id=run_id,
    )


def _validate_artifact_paths(ledger_path: Path, output_path: Path) -> None:
    if not ledger_path.is_absolute() or not output_path.is_absolute():
        raise EvaluationDataError("POC artifact paths must be absolute")
    if output_path.suffix != ".jsonl":
        raise EvaluationDataError("POC prediction output must be JSONL")
    try:
        ledger_parent = ledger_path.parent.resolve(strict=True)
        output_parent = output_path.parent.resolve(strict=True)
    except OSError as exc:
        raise EvaluationDataError(
            "POC artifact directory must already exist"
        ) from exc
    if ledger_parent != output_parent:
        raise EvaluationDataError(
            "Ledger and predictions must share one restricted directory"
        )
    repo_root = REPO_ROOT.resolve(strict=True)
    if output_parent == repo_root or repo_root in output_parent.parents:
        raise EvaluationDataError("POC raw artifacts cannot be stored in the repository")
    if os.name == "posix" and stat.S_IMODE(output_parent.stat().st_mode) & 0o077:
        raise EvaluationDataError("POC artifact directory must be owner-only")


async def run(args: argparse.Namespace) -> dict[str, Any]:
    if not 1 <= args.request_cap <= MAX_SYNTHETIC_POC_ATTEMPTS:
        raise EvaluationDataError("Synthetic MyScript POC cap must be between 1 and 50")
    _validate_artifact_paths(args.ledger, args.output)
    fixture_root = args.fixture_root.resolve(strict=True)
    manifest = load_manifest(
        args.manifest,
        FIXTURE_SCHEMA,
        fixture_root=fixture_root,
        stroke_schema_path=STROKE_SCHEMA,
        require_inputs=True,
        require_decision_ready=False,
    )
    if len(manifest.records) > args.request_cap:
        raise EvaluationDataError("Fixture count exceeds the total HTTP attempt cap")
    for fixture in manifest.records:
        if fixture["consent"]["source"] != "synthetic":
            raise EvaluationDataError("POC runner accepts synthetic fixtures only")
        if PROVIDER not in fixture["consent"]["approved_providers"]:
            raise EvaluationDataError("MyScript is not approved for every fixture")
        if fixture["domain"] != "math" or fixture["topic"] != "linear-equations":
            raise EvaluationDataError("POC runner accepts linear-equation math only")
        if set(fixture["inputs"]) != {"strokes"}:
            raise EvaluationDataError("POC runner accepts vector-only fixtures")

    ledger = DurableAttemptLedger(
        args.ledger,
        run_id=args.run_id,
        provider=PROVIDER,
        request_cap=args.request_cap,
    )
    if args.initialize_ledger:
        ledger.initialize()
    else:
        ledger.status()
    recognizer = MyScriptRecognizer(
        _settings(args.request_cap, args.ledger, args.run_id), budget=ledger
    )

    predictions: list[dict[str, Any]] = []
    stop_run = False
    for fixture in manifest.records:
        base = _prediction_base(fixture["id"], args.run_id)
        if stop_run:
            predictions.append(
                {**base, "status": "skipped", "benchmark_eligible": False}
            )
            continue
        stroke_file = _load_strokes(fixture_root, fixture["inputs"]["strokes"])
        request = MyScriptRecognizeRequest(
            schema_version=1,
            profile="linear-equation-v1",
            strokes=stroke_file["strokes"],
            dpi_x=96,
            dpi_y=96,
        )
        request_bytes = len(serialize_myscript_request(request))
        try:
            result = await recognizer.recognize(request)
        except MyScriptRecognitionError as exc:
            status, error_code = _safe_error(exc.code)
            predictions.append(
                {
                    **base,
                    "status": status,
                    "error_code": error_code,
                    "benchmark_eligible": False,
                }
            )
            stop_run = exc.code in _STOP_RUN_CODES
            continue
        predictions.append(
            {
                **base,
                "status": "ok",
                "output": {
                    # Preserve the provider response in the restricted artifact
                    # so a future normalizer can reproduce scoring without a
                    # second provider request.
                    "format": "latex",
                    "text": result.provider_latex,
                    "candidates": [],
                    "unreadable": result.unreadable,
                },
                "metrics": {
                    "latency_ms": result.latency_ms,
                    "request_bytes": request_bytes,
                    "parse_success": _judge_parse_success(
                        result.text, result.unreadable
                    ),
                    "fallback_used": False,
                    "cold_start": len(predictions) == 0,
                },
            }
        )

    write_restricted_jsonl(args.output, predictions)
    load_predictions(args.output, PREDICTION_SCHEMA)
    status = ledger.status()
    return {
        "valid": True,
        "run_id": args.run_id,
        "fixture_count": len(manifest.records),
        "prediction_count": len(predictions),
        "success_count": sum(item["status"] == "ok" for item in predictions),
        "error_count": sum(
            item["status"] in {"timeout", "error"} for item in predictions
        ),
        "skipped_count": sum(item["status"] == "skipped" for item in predictions),
        "request_cap": status.request_cap,
        "attempts_used": status.used,
        "attempts_remaining": status.remaining,
        "decision_eligible": False,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a synthetic-only MyScript POC")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--fixture-root", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--request-cap", required=True, type=int)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--initialize-ledger", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = asyncio.run(run(args))
    except (EvaluationDataError, AttemptLedgerError) as exc:
        print(f"myscript-poc: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
