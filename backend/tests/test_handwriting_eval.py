import json
from pathlib import Path

import pytest

from handwriting_eval.cli import main
from handwriting_eval.normalization import normalize_expression
from handwriting_eval.scoring import score_run
from handwriting_eval.validation import (
    EvaluationDataError,
    load_manifest,
    load_predictions,
)


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_SCHEMA = ROOT / "docs/handwriting/fixtures/fixture.schema.json"
STROKE_SCHEMA = ROOT / "docs/handwriting/fixtures/stroke.schema.json"
PREDICTION_SCHEMA = ROOT / "docs/handwriting/fixtures/prediction.schema.json"


def write_json(path, value):
    path.write_text(json.dumps(value), encoding="utf-8")


def write_jsonl(path, values):
    path.write_text(
        "\n".join(json.dumps(value) for value in values) + "\n",
        encoding="utf-8",
    )


def fixture_record(
    fixture_id="math-001",
    *,
    domain="math",
    expected="3*x + 2 = 5",
    expected_format="ascii",
    unreadable=False,
    input_path="strokes/math-001.json",
):
    return {
        "schema_version": 1,
        "id": fixture_id,
        "domain": domain,
        "topic": "linear-equations",
        "difficulty": "basic",
        "device_group": "tablet-stylus",
        "browser_group": "chromium",
        "inputs": {"strokes": input_path},
        "expected": {
            "format": expected_format,
            "canonical": expected,
            "accepted": [],
            "unreadable": unreadable,
        },
        "tags": [],
        "annotation": {"reviewer_count": 2, "status": "reviewed"},
        "consent": {
            "retention_approved": True,
            "retention_policy_id": "test-policy-v1",
            "source": "synthetic",
            "provenance_id": "synthetic-test-v1",
            "approved_providers": ["candidate"],
        },
    }


def stroke_record(*, times=(0, 5)):
    return {
        "schema_version": 1,
        "canvas": {
            "width": 200,
            "height": 100,
            "units": "css_px",
            "origin": "top_left",
        },
        "strokes": [
            {
                "pointer_type": "synthetic",
                "points": [
                    {"x": 10 + index, "y": 20 + index, "t": time, "p": 0.5}
                    for index, time in enumerate(times)
                ],
            }
        ],
    }


def prediction(
    fixture_id,
    text,
    *,
    output_format="ascii",
    unreadable=False,
    candidates=None,
    latency_ms=100,
    correction_required=False,
):
    return {
        "schema_version": 1,
        "fixture_id": fixture_id,
        "run_id": "candidate-run-1",
        "provider": "candidate",
        "model": "candidate-v1",
        "configuration_id": "rest-v1",
        "status": "ok",
        "benchmark_eligible": True,
        "output": {
            "format": output_format,
            "text": text,
            "candidates": candidates or [],
            "unreadable": unreadable,
        },
        "metrics": {
            "latency_ms": latency_ms,
            "request_bytes": 128,
            "cost_usd": 0.002,
            "parse_success": not unreadable,
            "fallback_used": False,
            "correction_required": correction_required,
            "cold_start": False,
        },
    }


def test_load_manifest_validates_schema_inputs_and_decision_readiness(tmp_path):
    stroke_dir = tmp_path / "strokes"
    stroke_dir.mkdir()
    write_json(stroke_dir / "math-001.json", stroke_record())
    manifest_path = tmp_path / "cases.jsonl"
    write_jsonl(manifest_path, [fixture_record()])

    result = load_manifest(
        manifest_path,
        FIXTURE_SCHEMA,
        fixture_root=tmp_path,
        stroke_schema_path=STROKE_SCHEMA,
        require_inputs=True,
        require_decision_ready=True,
    )

    assert result.decision_eligible is True
    assert [record["id"] for record in result.records] == ["math-001"]


def test_load_manifest_rejects_path_traversal(tmp_path):
    manifest_path = tmp_path / "cases.jsonl"
    write_jsonl(
        manifest_path,
        [fixture_record(input_path="../outside.json")],
    )

    with pytest.raises(EvaluationDataError, match="safe relative POSIX paths"):
        load_manifest(
            manifest_path,
            FIXTURE_SCHEMA,
            fixture_root=tmp_path,
            stroke_schema_path=STROKE_SCHEMA,
        )


def test_load_manifest_rejects_non_monotonic_stroke_time(tmp_path):
    stroke_dir = tmp_path / "strokes"
    stroke_dir.mkdir()
    write_json(stroke_dir / "math-001.json", stroke_record(times=(5, 4)))
    manifest_path = tmp_path / "cases.jsonl"
    write_jsonl(manifest_path, [fixture_record()])

    with pytest.raises(EvaluationDataError, match="non-decreasing"):
        load_manifest(
            manifest_path,
            FIXTURE_SCHEMA,
            fixture_root=tmp_path,
            stroke_schema_path=STROKE_SCHEMA,
        )


def test_schema_failure_does_not_echo_provider_output(tmp_path):
    raw_secret_content = "student-secret-transcription"
    invalid = prediction("math-001", raw_secret_content)
    del invalid["output"]["format"]
    path = tmp_path / "predictions.jsonl"
    write_jsonl(path, [invalid])

    with pytest.raises(EvaluationDataError) as captured:
        load_predictions(path, PREDICTION_SCHEMA)

    assert raw_secret_content not in str(captured.value)


def test_stroke_json_rejects_non_standard_numeric_constants(tmp_path):
    stroke_dir = tmp_path / "strokes"
    stroke_dir.mkdir()
    raw_strokes = json.dumps(stroke_record()).replace('"p": 0.5', '"p": NaN')
    (stroke_dir / "math-001.json").write_text(raw_strokes, encoding="utf-8")
    manifest_path = tmp_path / "cases.jsonl"
    write_jsonl(manifest_path, [fixture_record()])

    with pytest.raises(EvaluationDataError, match="Could not read JSON file"):
        load_manifest(
            manifest_path,
            FIXTURE_SCHEMA,
            fixture_root=tmp_path,
            stroke_schema_path=STROKE_SCHEMA,
        )


def test_normalization_is_conservative_and_preserves_chemistry_case():
    assert normalize_expression(r"\(3 \times x + 2 = 5\)", "latex", "math") == "3*x+2=5"
    assert normalize_expression("NH4+", "text", "chemistry_text") == "NH4+"
    assert normalize_expression("Nh4+", "text", "chemistry_text") == "Nh4+"


def test_score_run_reports_aggregates_without_raw_content(tmp_path):
    fixtures = [
        fixture_record(),
        fixture_record(
            "chem-001",
            domain="chemistry_text",
            expected="NH4+",
            expected_format="text",
            input_path="strokes/chem-001.json",
        ),
        fixture_record(
            "unreadable-001",
            expected="",
            unreadable=True,
            input_path="strokes/unreadable-001.json",
        ),
    ]
    manifest_path = tmp_path / "cases.jsonl"
    write_jsonl(manifest_path, fixtures)
    manifest = load_manifest(
        manifest_path,
        FIXTURE_SCHEMA,
        require_inputs=False,
        require_decision_ready=True,
    )
    predictions = [
        prediction("math-001", r"\(3 \times x + 2 = 5\)", output_format="latex", latency_ms=100),
        prediction(
            "chem-001",
            "Nh4+",
            candidates=["NH4+"],
            output_format="text",
            latency_ms=200,
            correction_required=True,
        ),
        prediction("unreadable-001", "", unreadable=True, latency_ms=300),
    ]

    report = score_run(
        manifest,
        predictions,
        corpus_version="test-v1",
    )
    serialized = json.dumps(report)

    assert report["decision_eligible"] is True
    assert report["overall"]["accuracy"]["normalized_exact_match_rate"] == pytest.approx(2 / 3)
    assert report["overall"]["accuracy"]["top_k_inclusion_rate"] == 1
    assert report["overall"]["latency_ms"] == {
        "observation_count": 3,
        "p50": 200.0,
        "p95": 290.0,
    }
    assert report["overall"]["operations"]["correction_rate"] == pytest.approx(1 / 3)
    assert "manifest_file" not in report["corpus"]
    for raw_value in ("3*x + 2 = 5", "NH4+", "Nh4+", "unreadable-001"):
        assert raw_value not in serialized


def test_score_run_rejects_incomplete_prediction_coverage(tmp_path):
    manifest_path = tmp_path / "cases.jsonl"
    write_jsonl(manifest_path, [fixture_record(), fixture_record("math-002")])
    manifest = load_manifest(
        manifest_path,
        FIXTURE_SCHEMA,
        require_inputs=False,
    )

    with pytest.raises(EvaluationDataError, match="coverage mismatch"):
        score_run(
            manifest,
            [prediction("math-001", "3*x + 2 = 5")],
            corpus_version="test-v1",
        )


def test_cost_estimate_uses_only_observed_cost_samples(tmp_path):
    manifest_path = tmp_path / "cases.jsonl"
    write_jsonl(manifest_path, [fixture_record(), fixture_record("math-002")])
    manifest = load_manifest(manifest_path, FIXTURE_SCHEMA, require_inputs=False)
    predictions = [
        prediction("math-001", "3*x + 2 = 5"),
        prediction("math-002", "3*x + 2 = 5"),
    ]
    del predictions[1]["metrics"]["cost_usd"]

    report = score_run(manifest, predictions, corpus_version="test-v1")

    operations = report["overall"]["operations"]
    assert operations["cost_observation_count"] == 1
    assert operations["estimated_cost_per_1000_usd"] == 2.0


def test_plan_enforces_provider_approval_and_request_cap(tmp_path, capsys):
    stroke_dir = tmp_path / "strokes"
    stroke_dir.mkdir()
    write_json(stroke_dir / "math-001.json", stroke_record())
    records = [fixture_record(), fixture_record("math-002")]
    manifest_path = tmp_path / "cases.jsonl"
    write_jsonl(manifest_path, records)
    output_path = tmp_path / "restricted-plan.json"
    common = [
        "plan",
        "--manifest",
        str(manifest_path),
        "--fixture-root",
        str(tmp_path),
        "--provider",
        "candidate",
        "--run-id",
        "test-run-1",
        "--output",
        str(output_path),
    ]

    assert main([*common, "--request-cap", "1"]) == 2
    assert not output_path.exists()
    capsys.readouterr()

    assert main([*common, "--request-cap", "2", "--decision-run"]) == 0
    plan = json.loads(output_path.read_text(encoding="utf-8"))
    assert plan["planned_requests"] == 2
    assert "expected" not in output_path.read_text(encoding="utf-8")
    assert output_path.stat().st_mode & 0o077 == 0
