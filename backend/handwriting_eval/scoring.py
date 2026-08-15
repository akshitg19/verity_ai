"""Content-free aggregate scoring for handwriting provider runs."""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from typing import Any, Callable, Iterable

from .normalization import NORMALIZATION_VERSION, normalize_expression
from .validation import EvaluationDataError, ManifestValidation


def _levenshtein(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1]
                    + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def _percentile(values: Iterable[float], quantile: float) -> float | None:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        return None
    if len(ordered) == 1:
        return round(ordered[0], 3)
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return round(ordered[lower], 3)
    interpolated = ordered[lower] + (ordered[upper] - ordered[lower]) * (
        position - lower
    )
    return round(interpolated, 3)


def _rate(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator, 6)


def _hash_records(records: Iterable[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for record in records:
        digest.update(
            json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
                "utf-8"
            )
        )
        digest.update(b"\n")
    return digest.hexdigest()


def _targets(fixture: dict[str, Any]) -> list[str]:
    expected = fixture["expected"]
    values = [expected["canonical"], *expected.get("accepted", [])]
    return [
        normalize_expression(value, expected["format"], fixture["domain"])
        for value in values
    ]


def _prediction_values(
    fixture: dict[str, Any], prediction: dict[str, Any]
) -> list[str]:
    output = prediction.get("output")
    if prediction["status"] != "ok" or output is None or output["unreadable"]:
        return []
    values = [output["text"], *output.get("candidates", [])]
    normalized: list[str] = []
    for value in values:
        candidate = normalize_expression(value, output["format"], fixture["domain"])
        if candidate not in normalized:
            normalized.append(candidate)
    return normalized


def _case_metrics(
    fixture: dict[str, Any], prediction: dict[str, Any]
) -> dict[str, Any]:
    expected_unreadable = fixture["expected"]["unreadable"]
    output = prediction.get("output") or {}
    predicted_unreadable = prediction["status"] == "ok" and bool(
        output.get("unreadable")
    )
    targets = _targets(fixture)
    values = _prediction_values(fixture, prediction)
    primary = values[:1]

    if expected_unreadable:
        exact = predicted_unreadable
        top_k = predicted_unreadable
        character_error_rate = None
    elif not values:
        exact = False
        top_k = False
        character_error_rate = 1.0
    else:
        exact = any(value in targets for value in primary)
        top_k = any(value in targets for value in values)
        error_rates = [
            _levenshtein(primary[0], target) / max(1, len(target))
            for target in targets
        ]
        character_error_rate = round(min(error_rates), 6)

    metrics = prediction.get("metrics", {})
    return {
        "success": prediction["status"] == "ok",
        "exact": exact,
        "top_k": top_k,
        "character_error_rate": character_error_rate,
        "expected_unreadable": expected_unreadable,
        "predicted_unreadable": predicted_unreadable,
        "parse_success": metrics.get("parse_success"),
        "fallback_used": metrics.get("fallback_used"),
        "correction_required": metrics.get("correction_required"),
        "latency_ms": metrics.get("latency_ms"),
        "request_bytes": metrics.get("request_bytes"),
        "cost_usd": metrics.get("cost_usd"),
        "status": prediction["status"],
        "error_code": prediction.get("error_code"),
    }


def _aggregate(cases: list[dict[str, Any]]) -> dict[str, Any]:
    sample_count = len(cases)
    successes = sum(case["success"] for case in cases)
    exact = sum(case["exact"] for case in cases)
    top_k = sum(case["top_k"] for case in cases)
    cer_values = [
        case["character_error_rate"]
        for case in cases
        if case["character_error_rate"] is not None
    ]
    parse_values = [
        case["parse_success"] for case in cases if case["parse_success"] is not None
    ]
    fallback_values = [
        case["fallback_used"] for case in cases if case["fallback_used"] is not None
    ]
    correction_values = [
        case["correction_required"]
        for case in cases
        if case["correction_required"] is not None
    ]
    latencies = [case["latency_ms"] for case in cases if case["latency_ms"] is not None]
    payloads = [
        case["request_bytes"] for case in cases if case["request_bytes"] is not None
    ]
    costs = [case["cost_usd"] for case in cases if case["cost_usd"] is not None]

    true_positive = sum(
        case["expected_unreadable"] and case["predicted_unreadable"] for case in cases
    )
    false_positive = sum(
        not case["expected_unreadable"] and case["predicted_unreadable"] for case in cases
    )
    false_negative = sum(
        case["expected_unreadable"] and not case["predicted_unreadable"] for case in cases
    )
    status_counts = Counter(case["status"] for case in cases)
    error_counts = Counter(
        case["error_code"] for case in cases if case["error_code"] is not None
    )

    return {
        "sample_count": sample_count,
        "accuracy": {
            "normalized_exact_match_rate": _rate(exact, sample_count),
            "top_k_inclusion_rate": _rate(top_k, sample_count),
            "mean_character_error_rate": (
                round(sum(cer_values) / len(cer_values), 6) if cer_values else None
            ),
            "parse_success_rate": _rate(sum(bool(value) for value in parse_values), len(parse_values)),
            "parse_observation_count": len(parse_values),
            "unreadable_precision": _rate(true_positive, true_positive + false_positive),
            "unreadable_recall": _rate(true_positive, true_positive + false_negative),
        },
        "latency_ms": {
            "observation_count": len(latencies),
            "p50": _percentile(latencies, 0.50),
            "p95": _percentile(latencies, 0.95),
        },
        "operations": {
            "success_rate": _rate(successes, sample_count),
            "status_counts": dict(sorted(status_counts.items())),
            "error_code_counts": dict(sorted(error_counts.items())),
            "fallback_rate": _rate(
                sum(bool(value) for value in fallback_values), len(fallback_values)
            ),
            "fallback_observation_count": len(fallback_values),
            "correction_rate": _rate(
                sum(bool(value) for value in correction_values), len(correction_values)
            ),
            "correction_observation_count": len(correction_values),
            "request_bytes": {
                "observation_count": len(payloads),
                "mean": round(sum(payloads) / len(payloads), 3) if payloads else None,
                "p95": _percentile(payloads, 0.95),
            },
            "observed_cost_usd": round(sum(costs), 8) if costs else None,
            "estimated_cost_per_1000_usd": (
                round(sum(costs) / len(costs) * 1000, 6) if costs else None
            ),
            "cost_observation_count": len(costs),
        },
    }


def _breakdown(
    fixtures: list[dict[str, Any]],
    cases: list[dict[str, Any]],
    classifier: Callable[[dict[str, Any]], Iterable[str]],
) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for fixture, case in zip(fixtures, cases, strict=True):
        for label in classifier(fixture):
            grouped[label].append(case)
    return {label: _aggregate(grouped[label]) for label in sorted(grouped)}


def score_run(
    manifest: ManifestValidation,
    predictions: list[dict[str, Any]],
    *,
    corpus_version: str,
) -> dict[str, Any]:
    """Score one uniform provider run and return an aggregate-only report."""

    fixtures = manifest.records
    fixture_by_id = {fixture["id"]: fixture for fixture in fixtures}
    prediction_by_id = {
        prediction["fixture_id"]: prediction for prediction in predictions
    }
    missing = sorted(set(fixture_by_id) - set(prediction_by_id))
    extra = sorted(set(prediction_by_id) - set(fixture_by_id))
    if missing or extra:
        descriptions: list[str] = []
        if missing:
            descriptions.append(f"{len(missing)} missing prediction(s)")
        if extra:
            descriptions.append(f"{len(extra)} unknown prediction(s)")
        raise EvaluationDataError("Prediction coverage mismatch: " + ", ".join(descriptions))

    run_fields = ("run_id", "provider", "model", "configuration_id")
    run_values = {field: {record[field] for record in predictions} for field in run_fields}
    inconsistent = [field for field, values in run_values.items() if len(values) != 1]
    if inconsistent:
        raise EvaluationDataError(
            "Prediction file mixes multiple run identities: " + ", ".join(inconsistent)
        )

    ordered_predictions = [prediction_by_id[fixture["id"]] for fixture in fixtures]
    cases = [
        _case_metrics(fixture, prediction)
        for fixture, prediction in zip(fixtures, ordered_predictions, strict=True)
    ]
    prediction_ineligible = any(
        not prediction["benchmark_eligible"] for prediction in ordered_predictions
    )
    reasons = set(manifest.ineligibility_reasons)
    if prediction_ineligible:
        reasons.add("adapter_or_prediction_not_benchmark_eligible")
    if any(
        prediction["provider"] not in fixture["consent"]["approved_providers"]
        for fixture, prediction in zip(fixtures, ordered_predictions, strict=True)
    ):
        reasons.add("provider_not_approved_for_all_fixtures")

    manifest_sha256 = _hash_records(fixtures)
    report = {
        "schema_version": 1,
        "corpus": {
            "version": corpus_version,
            "sample_count": len(fixtures),
            "manifest_sha256": manifest_sha256,
        },
        "normalization_version": NORMALIZATION_VERSION,
        "run": {field: next(iter(run_values[field])) for field in run_fields},
        "decision_eligible": not reasons,
        "ineligibility_reasons": sorted(reasons),
        "overall": _aggregate(cases),
        "breakdowns": {
            "domain": _breakdown(fixtures, cases, lambda fixture: [fixture["domain"]]),
            "difficulty": _breakdown(
                fixtures, cases, lambda fixture: [fixture["difficulty"]]
            ),
            "topic": _breakdown(fixtures, cases, lambda fixture: [fixture["topic"]]),
            "tag": _breakdown(fixtures, cases, lambda fixture: fixture["tags"]),
            "device_group": _breakdown(
                fixtures,
                cases,
                lambda fixture: [fixture.get("device_group", "unspecified")],
            ),
            "browser_group": _breakdown(
                fixtures,
                cases,
                lambda fixture: [fixture.get("browser_group", "unspecified")],
            ),
        },
    }
    return report
