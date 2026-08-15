"""Command-line entry point for offline handwriting evaluation artifacts."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from .ledger import AttemptLedgerError, DurableAttemptLedger
from .scoring import score_run
from .validation import (
    EvaluationDataError,
    load_manifest,
    load_predictions,
    write_json,
    write_restricted_json,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIXTURE_SCHEMA = REPO_ROOT / "docs/handwriting/fixtures/fixture.schema.json"
DEFAULT_STROKE_SCHEMA = REPO_ROOT / "docs/handwriting/fixtures/stroke.schema.json"
DEFAULT_PREDICTION_SCHEMA = (
    REPO_ROOT / "docs/handwriting/fixtures/prediction.schema.json"
)
SAFE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]+$")


def _common_manifest_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--fixture-schema", type=Path, default=DEFAULT_FIXTURE_SCHEMA)
    parser.add_argument("--stroke-schema", type=Path, default=DEFAULT_STROKE_SCHEMA)
    parser.add_argument("--fixture-root", type=Path)
    parser.add_argument(
        "--allow-consented-user",
        action="store_true",
        help="Allow restricted consented-user records after an external policy check.",
    )


def _load_from_args(
    args: argparse.Namespace, *, require_inputs: bool, decision_ready: bool
):
    return load_manifest(
        args.manifest,
        args.fixture_schema,
        fixture_root=args.fixture_root,
        stroke_schema_path=args.stroke_schema,
        require_inputs=require_inputs,
        require_decision_ready=decision_ready,
        allow_consented_user=args.allow_consented_user,
    )


def _validate_command(args: argparse.Namespace) -> dict[str, Any]:
    result = _load_from_args(
        args,
        require_inputs=not args.manifest_only,
        decision_ready=args.decision_run,
    )
    return {
        "valid": True,
        "record_count": len(result.records),
        "decision_eligible": result.decision_eligible,
        "ineligibility_reasons": list(result.ineligibility_reasons),
    }


def _score_command(args: argparse.Namespace) -> dict[str, Any]:
    if not SAFE_ID_RE.fullmatch(args.corpus_version):
        raise EvaluationDataError(
            "corpus-version must use lowercase letters, numbers, dots, underscores, or hyphens"
        )
    manifest = _load_from_args(
        args,
        require_inputs=args.verify_inputs or args.decision_run,
        decision_ready=args.decision_run,
    )
    predictions = load_predictions(args.predictions, args.prediction_schema)
    report = score_run(
        manifest,
        predictions,
        corpus_version=args.corpus_version,
    )
    if args.decision_run and not report["decision_eligible"]:
        raise EvaluationDataError(
            "Run is not decision-ready: "
            + ", ".join(report["ineligibility_reasons"])
        )
    if args.output:
        write_json(args.output, report)
    return report


def _plan_command(args: argparse.Namespace) -> dict[str, Any]:
    for label, value in (("provider", args.provider), ("run-id", args.run_id)):
        if not SAFE_ID_RE.fullmatch(value):
            raise EvaluationDataError(
                f"{label} must use lowercase letters, numbers, dots, underscores, or hyphens"
            )
    if not 1 <= args.request_cap <= 10_000:
        raise EvaluationDataError("request-cap must be between 1 and 10000")
    if not 1 <= args.repeat <= 20:
        raise EvaluationDataError("repeat must be between 1 and 20")

    manifest = _load_from_args(
        args,
        require_inputs=True,
        decision_ready=args.decision_run,
    )
    unapproved = [
        fixture["id"]
        for fixture in manifest.records
        if args.provider not in fixture["consent"]["approved_providers"]
    ]
    if unapproved:
        raise EvaluationDataError(
            f"Provider is not approved for {len(unapproved)} fixture(s)"
        )
    planned_requests = len(manifest.records) * args.repeat
    if planned_requests > args.request_cap:
        raise EvaluationDataError(
            f"Run plans {planned_requests} requests, exceeding cap {args.request_cap}"
        )
    if args.provider == "myscript" and args.request_cap > 650:
        raise EvaluationDataError("MyScript POC request-cap cannot exceed 650")

    requests = []
    for repeat_index in range(args.repeat):
        for fixture in manifest.records:
            requests.append(
                {
                    "fixture_id": fixture["id"],
                    "sequence": len(requests) + 1,
                    "repeat_index": repeat_index,
                    "domain": fixture["domain"],
                    "inputs": fixture["inputs"],
                }
            )
    plan = {
        "schema_version": 1,
        "run_id": args.run_id,
        "provider": args.provider,
        "request_cap": args.request_cap,
        "planned_requests": planned_requests,
        "decision_eligible": manifest.decision_eligible,
        "requests": requests,
    }
    write_restricted_json(args.output, plan)
    return {
        "valid": True,
        "run_id": args.run_id,
        "provider": args.provider,
        "planned_requests": planned_requests,
        "request_cap": args.request_cap,
        "decision_eligible": manifest.decision_eligible,
    }


def _ledger(args: argparse.Namespace) -> DurableAttemptLedger:
    return DurableAttemptLedger(
        args.ledger,
        run_id=args.run_id,
        provider=args.provider,
        request_cap=args.request_cap,
    )


def _ledger_init_command(args: argparse.Namespace) -> dict[str, Any]:
    status = _ledger(args).initialize()
    return {
        "valid": True,
        "run_id": status.run_id,
        "provider": status.provider,
        "request_cap": status.request_cap,
        "used": status.used,
        "remaining": status.remaining,
    }


def _ledger_status_command(args: argparse.Namespace) -> dict[str, Any]:
    status = _ledger(args).status()
    return {
        "valid": True,
        "run_id": status.run_id,
        "provider": status.provider,
        "request_cap": status.request_cap,
        "used": status.used,
        "remaining": status.remaining,
    }


def _ledger_reserve_command(args: argparse.Namespace) -> dict[str, Any]:
    ledger = _ledger(args)
    sequence = ledger.reserve()
    return {
        "valid": True,
        "sequence": sequence,
        "used": sequence,
        "remaining": ledger.request_cap - sequence,
    }


def _ledger_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--request-cap", required=True, type=int)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m handwriting_eval.cli",
        description=(
            "Validate and score restricted handwriting fixtures without making provider calls."
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate a JSONL fixture manifest")
    _common_manifest_arguments(validate_parser)
    validate_parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="Validate record shape without opening referenced inputs.",
    )
    validate_parser.add_argument(
        "--decision-run",
        action="store_true",
        help="Require two reviewers, approved retention, and device/browser groups.",
    )
    validate_parser.set_defaults(handler=_validate_command)

    score_parser = subparsers.add_parser(
        "score", help="Create a content-free aggregate report from provider predictions"
    )
    _common_manifest_arguments(score_parser)
    score_parser.add_argument("--predictions", required=True, type=Path)
    score_parser.add_argument(
        "--prediction-schema", type=Path, default=DEFAULT_PREDICTION_SCHEMA
    )
    score_parser.add_argument("--corpus-version", required=True)
    score_parser.add_argument("--output", type=Path)
    score_parser.add_argument(
        "--verify-inputs",
        action="store_true",
        help="Open and validate every referenced stroke/PNG input before scoring.",
    )
    score_parser.add_argument(
        "--decision-run",
        action="store_true",
        help="Fail unless fixtures and predictions are eligible for a provider decision.",
    )
    score_parser.set_defaults(handler=_score_command)

    plan_parser = subparsers.add_parser(
        "plan",
        help="Create a restricted, ground-truth-free provider replay plan without calling it",
    )
    _common_manifest_arguments(plan_parser)
    plan_parser.add_argument("--provider", required=True)
    plan_parser.add_argument("--run-id", required=True)
    plan_parser.add_argument("--request-cap", required=True, type=int)
    plan_parser.add_argument("--repeat", type=int, default=1)
    plan_parser.add_argument("--output", required=True, type=Path)
    plan_parser.add_argument(
        "--decision-run",
        action="store_true",
        help="Require two-reviewer, retention, and device/browser decision gates.",
    )
    plan_parser.set_defaults(handler=_plan_command)

    ledger_init_parser = subparsers.add_parser(
        "ledger-init",
        help="Create a content-free provider-attempt ledger outside the repository",
    )
    _ledger_arguments(ledger_init_parser)
    ledger_init_parser.set_defaults(handler=_ledger_init_command)

    ledger_status_parser = subparsers.add_parser(
        "ledger-status", help="Read a content-free provider-attempt ledger"
    )
    _ledger_arguments(ledger_status_parser)
    ledger_status_parser.set_defaults(handler=_ledger_status_command)

    ledger_reserve_parser = subparsers.add_parser(
        "ledger-reserve",
        help="Reserve for an executor that does not already use the Python ledger API",
    )
    _ledger_arguments(ledger_reserve_parser)
    ledger_reserve_parser.set_defaults(handler=_ledger_reserve_command)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = args.handler(args)
    except (EvaluationDataError, AttemptLedgerError) as exc:
        print(f"handwriting-eval: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
