"""Content-safe migration of restricted MyScript prediction artifacts.

The first synthetic smoke stored already-normalized ASCII. This utility applies
the current versioned normalizer and deterministic algebra parser without
making a provider request, while preserving the original artifact unchanged.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any

from judge.algebra import _parse_equation

from .normalization import NORMALIZATION_VERSION, normalize_expression
from .validation import (
    EvaluationDataError,
    load_predictions,
    write_restricted_jsonl,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
PREDICTION_SCHEMA = REPO_ROOT / "docs/handwriting/fixtures/prediction.schema.json"


def _validate_paths(source: Path, output: Path) -> None:
    if not source.is_absolute() or not output.is_absolute():
        raise EvaluationDataError("Prediction artifact paths must be absolute")
    if source.suffix != ".jsonl" or output.suffix != ".jsonl":
        raise EvaluationDataError("Prediction artifacts must be JSONL")
    if source == output:
        raise EvaluationDataError("Reprocessing must preserve the source artifact")
    try:
        source_parent = source.parent.resolve(strict=True)
        output_parent = output.parent.resolve(strict=True)
        resolved_source = source.resolve(strict=True)
    except OSError as exc:
        raise EvaluationDataError(
            "Restricted prediction artifact path is unavailable"
        ) from exc
    if (
        not resolved_source.is_file()
        or resolved_source.parent != source_parent
        or source_parent != output_parent
    ):
        raise EvaluationDataError(
            "Source and output must share one restricted directory"
        )
    repo_root = REPO_ROOT.resolve(strict=True)
    if output_parent == repo_root or repo_root in output_parent.parents:
        raise EvaluationDataError(
            "Raw prediction artifacts cannot be stored in the repository"
        )
    if os.name == "posix" and stat.S_IMODE(output_parent.stat().st_mode) & 0o077:
        raise EvaluationDataError("Prediction artifact directory must be owner-only")
    if os.name == "posix" and stat.S_IMODE(resolved_source.stat().st_mode) & 0o077:
        raise EvaluationDataError("Source prediction artifact must be owner-only")


def _parse_success(text: str, unreadable: bool) -> bool:
    if unreadable or not text:
        return False
    try:
        _parse_equation(text)
    except Exception:
        return False
    return True


def _normalize_myscript_output(output: dict[str, Any]) -> tuple[str, list[str]]:
    source_format = output["format"]
    if source_format not in {"ascii", "latex"}:
        raise EvaluationDataError("MyScript math output format is unsupported")
    # Legacy ASCII artifacts were produced from MyScript's LaTeX response. Use
    # LaTeX whitespace semantics for both legacy ASCII and current raw LaTeX.
    primary = normalize_expression(output["text"], "latex", "math")
    candidates: list[str] = []
    for candidate in output.get("candidates", []):
        normalized = normalize_expression(candidate, "latex", "math")
        if normalized != primary and normalized not in candidates:
            candidates.append(normalized)
    return primary, candidates


def reprocess(source: Path, output: Path) -> dict[str, Any]:
    _validate_paths(source, output)
    records = load_predictions(source, PREDICTION_SCHEMA)
    if any(record["provider"] != "myscript" for record in records):
        raise EvaluationDataError("Reprocessor accepts MyScript predictions only")

    migrated: list[dict[str, Any]] = []
    parse_success_count = 0
    for original in records:
        record = copy.deepcopy(original)
        record["normalization_version"] = NORMALIZATION_VERSION
        provider_output = record.get("output")
        if record["status"] == "ok" and provider_output is not None:
            normalized, candidates = _normalize_myscript_output(provider_output)
            unreadable = bool(provider_output["unreadable"])
            provider_output["format"] = "ascii"
            provider_output["text"] = normalized
            provider_output["candidates"] = candidates
            metrics = record.setdefault("metrics", {})
            metrics["parse_success"] = _parse_success(normalized, unreadable)
            parse_success_count += int(metrics["parse_success"])
        migrated.append(record)

    write_restricted_jsonl(output, migrated)
    load_predictions(output, PREDICTION_SCHEMA)
    return {
        "valid": True,
        "record_count": len(migrated),
        "normalization_version": NORMALIZATION_VERSION,
        "parse_success_count": parse_success_count,
        "provider_request_count": 0,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Reprocess a restricted MyScript prediction artifact offline"
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = reprocess(args.source, args.output)
    except EvaluationDataError:
        # Keep restricted paths, fixture identifiers, and provider content out
        # of ordinary shell/CI output even when validation fails.
        print("myscript-reprocess: restricted_artifact_invalid", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
