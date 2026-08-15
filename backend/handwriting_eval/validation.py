"""Schema and safety validation for restricted handwriting evaluation data."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError


MAX_MANIFEST_RECORDS = 10_000
MAX_JSONL_LINE_BYTES = 2 * 1024 * 1024
MAX_STROKE_FILE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024
MAX_TOTAL_POINTS = 50_000
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

_EMAIL_RE = re.compile(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b")
_UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)


class EvaluationDataError(ValueError):
    """An evaluation artifact is invalid or violates a data-handling guardrail."""


class _StrictJSONError(ValueError):
    """A JSON input uses a Python extension that the JSON standard forbids."""


@dataclass(frozen=True)
class ManifestValidation:
    records: list[dict[str, Any]]
    decision_eligible: bool
    ineligibility_reasons: tuple[str, ...]


def _reject_json_constant(_value: str) -> None:
    raise _StrictJSONError("Non-finite numeric constants are not valid JSON")


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise _StrictJSONError("Duplicate object keys are not permitted")
        result[key] = value
    return result


def _strict_json_loads(value: str | bytes) -> Any:
    return json.loads(
        value,
        parse_constant=_reject_json_constant,
        object_pairs_hook=_reject_duplicate_keys,
    )


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = _strict_json_loads(path.read_text(encoding="utf-8"))
    except (
        OSError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        _StrictJSONError,
    ) as exc:
        raise EvaluationDataError(f"Could not read JSON file: {path}") from exc
    if not isinstance(value, dict):
        raise EvaluationDataError(f"JSON schema must be an object: {path}")
    return value


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        with path.open("rb") as input_file:
            line_number = 0
            while raw_line := input_file.readline(MAX_JSONL_LINE_BYTES + 3):
                line_number += 1
                line = raw_line.rstrip(b"\r\n")
                if len(line) > MAX_JSONL_LINE_BYTES:
                    raise EvaluationDataError(
                        f"JSONL line {line_number} exceeds the per-record size limit"
                    )
                if not line.strip():
                    continue
                if len(records) >= MAX_MANIFEST_RECORDS:
                    raise EvaluationDataError(
                        f"JSONL file exceeds the {MAX_MANIFEST_RECORDS}-record safety limit"
                    )
                try:
                    value = _strict_json_loads(line)
                except (
                    UnicodeDecodeError,
                    json.JSONDecodeError,
                    _StrictJSONError,
                ) as exc:
                    raise EvaluationDataError(
                        f"JSONL line {line_number} is not strict UTF-8 JSON"
                    ) from exc
                if not isinstance(value, dict):
                    raise EvaluationDataError(
                        f"JSONL line {line_number} must contain one JSON object"
                    )
                records.append(value)
    except OSError as exc:
        raise EvaluationDataError(f"Could not read JSONL file: {path}") from exc
    if not records:
        raise EvaluationDataError(f"JSONL file contains no records: {path}")
    return records


def _format_schema_error(line_number: int, error: Any) -> str:
    location = ".".join(str(part) for part in error.absolute_path) or "<record>"
    # Do not include jsonschema's message: it can echo raw handwriting output.
    return (
        f"line {line_number}, {location}: failed JSON Schema rule "
        f"{error.validator!r}"
    )


def _validate_records(
    records: Iterable[dict[str, Any]], schema: dict[str, Any]
) -> None:
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise EvaluationDataError("JSON Schema is not a valid Draft 2020-12 schema") from exc
    validator = Draft202012Validator(schema)
    failures: list[str] = []
    for line_number, record in enumerate(records, start=1):
        failures.extend(
            _format_schema_error(line_number, error)
            for error in sorted(
                validator.iter_errors(record),
                key=lambda item: tuple(str(part) for part in item.absolute_path),
            )
        )
    if failures:
        preview = failures[:20]
        remainder = len(failures) - len(preview)
        suffix = f"\n... and {remainder} more" if remainder else ""
        raise EvaluationDataError("Schema validation failed:\n" + "\n".join(preview) + suffix)


def _safe_fixture_path(root: Path, relative_path: str) -> Path:
    posix_path = PurePosixPath(relative_path)
    if posix_path.is_absolute() or ".." in posix_path.parts or "\\" in relative_path:
        raise EvaluationDataError("Fixture input paths must be safe relative POSIX paths")
    candidate = root.joinpath(*posix_path.parts)
    try:
        resolved_root = root.resolve(strict=True)
        resolved_candidate = candidate.resolve(strict=True)
    except OSError as exc:
        raise EvaluationDataError(f"Fixture input does not exist: {relative_path}") from exc
    if resolved_candidate != resolved_root and resolved_root not in resolved_candidate.parents:
        raise EvaluationDataError("Fixture input resolves outside the approved fixture root")
    if not resolved_candidate.is_file():
        raise EvaluationDataError(f"Fixture input is not a regular file: {relative_path}")
    return resolved_candidate


def _validate_stroke_file(path: Path, stroke_schema: dict[str, Any]) -> None:
    if path.stat().st_size > MAX_STROKE_FILE_BYTES:
        raise EvaluationDataError("Stroke fixture exceeds the file-size safety limit")
    value = _read_json(path)
    _validate_records([value], stroke_schema)

    total_points = 0
    width = value["canvas"]["width"]
    height = value["canvas"]["height"]
    for stroke_index, stroke in enumerate(value["strokes"]):
        points = stroke["points"]
        total_points += len(points)
        previous_time = -1.0
        for point_index, point in enumerate(points):
            if point["t"] < previous_time:
                raise EvaluationDataError(
                    "Stroke timestamps must be non-decreasing "
                    f"(stroke {stroke_index}, point {point_index})"
                )
            previous_time = point["t"]
            if not (0 <= point["x"] <= width and 0 <= point["y"] <= height):
                raise EvaluationDataError(
                    "Stroke points must remain inside the declared canvas "
                    f"(stroke {stroke_index}, point {point_index})"
                )
    if total_points > MAX_TOTAL_POINTS:
        raise EvaluationDataError(
            f"Stroke fixture exceeds the {MAX_TOTAL_POINTS}-point safety limit"
        )


def _validate_png(path: Path) -> None:
    if path.stat().st_size > MAX_IMAGE_FILE_BYTES:
        raise EvaluationDataError("PNG fixture exceeds the file-size safety limit")
    try:
        with path.open("rb") as image_file:
            signature = image_file.read(len(PNG_SIGNATURE))
    except OSError as exc:
        raise EvaluationDataError("Could not read PNG fixture") from exc
    if signature != PNG_SIGNATURE:
        raise EvaluationDataError("Image fixture is not a PNG")


def _manifest_eligibility(record: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    annotation = record.get("annotation", {})
    consent = record.get("consent", {})
    if annotation.get("status") not in {"reviewed", "adjudicated"}:
        reasons.append("fixture_not_reviewed")
    if annotation.get("reviewer_count", 0) < 2:
        reasons.append("fixture_has_fewer_than_two_reviewers")
    if consent.get("retention_approved") is not True:
        reasons.append("fixture_retention_not_approved")
    if not record.get("device_group"):
        reasons.append("fixture_device_group_missing")
    if not record.get("browser_group"):
        reasons.append("fixture_browser_group_missing")
    return reasons


def _lint_annotation(record: dict[str, Any]) -> None:
    notes = record.get("annotation", {}).get("notes", "")
    if _EMAIL_RE.search(notes) or _UUID_RE.search(notes):
        raise EvaluationDataError(
            "Annotation notes contain an email address or persistent UUID-like identifier"
        )


def load_manifest(
    manifest_path: Path | str,
    schema_path: Path | str,
    *,
    fixture_root: Path | str | None = None,
    stroke_schema_path: Path | str | None = None,
    require_inputs: bool = True,
    require_decision_ready: bool = False,
    allow_consented_user: bool = False,
) -> ManifestValidation:
    """Load a fixture manifest and apply schema, path, and review guardrails."""

    manifest = Path(manifest_path)
    schema = _read_json(Path(schema_path))
    records = _read_jsonl(manifest)
    _validate_records(records, schema)

    ids: set[str] = set()
    reasons: set[str] = set()
    root = Path(fixture_root) if fixture_root is not None else manifest.parent
    stroke_schema = (
        _read_json(Path(stroke_schema_path)) if stroke_schema_path is not None else None
    )

    for record in records:
        fixture_id = record["id"]
        if fixture_id in ids:
            raise EvaluationDataError(f"Duplicate fixture id: {fixture_id}")
        ids.add(fixture_id)
        _lint_annotation(record)
        reasons.update(_manifest_eligibility(record))

        if record["consent"]["source"] == "consented_user" and not allow_consented_user:
            raise EvaluationDataError(
                "Consented-user fixtures require the explicit --allow-consented-user flag"
            )

        if not require_inputs:
            continue
        for input_type, relative_path in record["inputs"].items():
            input_path = _safe_fixture_path(root, relative_path)
            if input_type == "strokes":
                if stroke_schema is None:
                    raise EvaluationDataError(
                        "A stroke schema is required when validating stroke input files"
                    )
                _validate_stroke_file(input_path, stroke_schema)
            elif input_type == "image":
                _validate_png(input_path)

    sorted_reasons = tuple(sorted(reasons))
    if require_decision_ready and sorted_reasons:
        raise EvaluationDataError(
            "Manifest is not decision-ready: " + ", ".join(sorted_reasons)
        )
    return ManifestValidation(
        records=records,
        decision_eligible=not sorted_reasons,
        ineligibility_reasons=sorted_reasons,
    )


def load_predictions(
    prediction_path: Path | str, schema_path: Path | str
) -> list[dict[str, Any]]:
    """Load provider predictions without echoing their content on errors."""

    records = _read_jsonl(Path(prediction_path))
    _validate_records(records, _read_json(Path(schema_path)))
    fixture_ids: set[str] = set()
    for record in records:
        fixture_id = record["fixture_id"]
        if fixture_id in fixture_ids:
            raise EvaluationDataError(f"Duplicate prediction for fixture id: {fixture_id}")
        fixture_ids.add(fixture_id)
    return records


def write_json(path: Path | str, value: dict[str, Any]) -> None:
    """Write a deterministic JSON report after its parent directory exists."""

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def write_restricted_json(path: Path | str, value: dict[str, Any]) -> None:
    """Write a raw evaluation artifact with owner-only permissions on POSIX."""

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if os.name != "posix":
        output_path.write_text(payload, encoding="utf-8")
        return

    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(output_path, flags, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output_file:
            output_file.write(payload)
        output_path.chmod(0o600)
    except OSError as exc:
        raise EvaluationDataError("Could not write restricted JSON artifact") from exc
