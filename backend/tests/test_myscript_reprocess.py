import json
import os
import stat
from pathlib import Path

import pytest

from handwriting_eval.myscript_reprocess import main, reprocess
from handwriting_eval.validation import EvaluationDataError


def _prediction(text="1 0 - x = 4", *, provider="myscript"):
    return {
        "schema_version": 1,
        "fixture_id": "synthetic-linear-001",
        "run_id": "synthetic-run-1",
        "provider": provider,
        "model": "provider-v1",
        "configuration_id": "math-latex-rest-v1",
        "status": "ok",
        "benchmark_eligible": True,
        "output": {
            "format": "ascii",
            "text": text,
            "candidates": [],
            "unreadable": False,
        },
        "metrics": {
            "latency_ms": 100,
            "request_bytes": 1000,
            "parse_success": False,
            "fallback_used": False,
        },
    }


def _write_source(path: Path, records):
    path.write_text(
        "".join(
            json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"
            for record in records
        ),
        encoding="utf-8",
    )
    if os.name == "posix":
        path.chmod(0o600)


def test_reprocess_applies_v2_and_recomputes_parse_without_provider_request(tmp_path):
    tmp_path.chmod(0o700)
    source = tmp_path / "source.jsonl"
    output = tmp_path / "output.jsonl"
    _write_source(source, [_prediction()])

    result = reprocess(source, output)

    assert result == {
        "valid": True,
        "record_count": 1,
        "normalization_version": "v2",
        "parse_success_count": 1,
        "provider_request_count": 0,
    }
    migrated = json.loads(output.read_text(encoding="utf-8"))
    assert migrated["normalization_version"] == "v2"
    assert migrated["output"]["format"] == "ascii"
    assert migrated["output"]["text"] == "10-x=4"
    assert migrated["metrics"]["parse_success"] is True
    if os.name == "posix" and stat.S_ISREG(output.stat().st_mode):
        assert output.stat().st_mode & 0o077 == 0


def test_reprocess_rejects_other_providers_without_echoing_output(tmp_path):
    tmp_path.chmod(0o700)
    raw_content = "private-provider-output"
    source = tmp_path / "source.jsonl"
    output = tmp_path / "output.jsonl"
    _write_source(source, [_prediction(raw_content, provider="other")])

    with pytest.raises(EvaluationDataError, match="MyScript predictions only") as captured:
        reprocess(source, output)

    assert raw_content not in str(captured.value)
    assert not output.exists()


def test_reprocess_requires_owner_only_external_artifact_directory(tmp_path):
    source = tmp_path / "source.jsonl"
    output = tmp_path / "output.jsonl"
    _write_source(source, [_prediction()])
    if os.name == "posix":
        tmp_path.chmod(0o755)
        with pytest.raises(EvaluationDataError, match="owner-only"):
            reprocess(source, output)


def test_reprocess_rejects_source_symlink_outside_restricted_directory(tmp_path):
    if os.name != "posix":
        pytest.skip("POSIX symlink safety check")
    restricted = tmp_path / "restricted"
    restricted.mkdir(mode=0o700)
    outside = tmp_path / "outside.jsonl"
    _write_source(outside, [_prediction()])
    source = restricted / "source.jsonl"
    source.symlink_to(outside)

    with pytest.raises(EvaluationDataError, match="share one restricted directory"):
        reprocess(source, restricted / "output.jsonl")


def test_reprocess_cli_failure_is_content_safe(tmp_path, capsys):
    tmp_path.chmod(0o700)
    raw_content = "private-provider-output"
    source = tmp_path / "source.jsonl"
    _write_source(source, [_prediction(raw_content, provider="other")])

    assert main(
        ["--source", str(source), "--output", str(tmp_path / "output.jsonl")]
    ) == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err.strip() == "myscript-reprocess: restricted_artifact_invalid"
    assert raw_content not in captured.err
