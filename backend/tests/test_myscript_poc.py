import argparse
import asyncio
import json
import os
import stat
from pathlib import Path

import pytest

from handwriting_eval import myscript_poc
from handwriting_eval.ledger import MYSCRIPT_POC_ATTEMPT_CAP, DurableAttemptLedger
from handwriting_eval.validation import EvaluationDataError
from myscript_recognition import MyScriptRecognition


FIXTURE_ROOT = (
    Path(__file__).resolve().parents[2]
    / "docs/handwriting/fixtures/synthetic-myscript-smoke-v1"
)
X_CASE_FIXTURE_ROOT = (
    Path(__file__).resolve().parents[2]
    / "docs/handwriting/fixtures/synthetic-myscript-x-case-v1"
)


def args(tmp_path, *, request_cap=30):
    return argparse.Namespace(
        manifest=FIXTURE_ROOT / "manifest.jsonl",
        fixture_root=FIXTURE_ROOT,
        ledger=tmp_path / "poc.handwriting-ledger.jsonl",
        run_id="synthetic-poc-test",
        request_cap=request_cap,
        output=tmp_path / "predictions.jsonl",
        initialize_ledger=True,
    )


def test_synthetic_poc_uses_shared_1500_cap_and_rejects_1501(tmp_path):
    tmp_path.chmod(0o700)
    assert MYSCRIPT_POC_ATTEMPT_CAP == 1500
    with pytest.raises(EvaluationDataError, match="between 1 and 1500"):
        asyncio.run(myscript_poc.run(args(tmp_path, request_cap=1501)))


def test_parse_success_uses_the_deterministic_algebra_parser():
    assert myscript_poc._judge_parse_success("2*x+1=5", False) is True
    assert myscript_poc._judge_parse_success("2+", False) is False
    assert myscript_poc._judge_parse_success("x=3", True) is False


def test_synthetic_poc_reserves_every_attempt_and_writes_owner_only_output(
    tmp_path, monkeypatch
):
    tmp_path.chmod(0o700)
    class FakeRecognizer:
        def __init__(self, _settings, *, budget):
            self.budget = budget

        async def recognize(self, _request):
            self.budget.reserve()
            return MyScriptRecognition(
                text="x=3",
                provider_latex="x = 3",
                unreadable=False,
                attempts=1,
                latency_ms=12,
            )

    monkeypatch.setattr(myscript_poc, "MyScriptRecognizer", FakeRecognizer)
    monkeypatch.setenv("MYSCRIPT_APPLICATION_KEY", "synthetic-app-key")
    monkeypatch.setenv("MYSCRIPT_HMAC_KEY", "synthetic-hmac-key")

    options = args(tmp_path)
    result = asyncio.run(myscript_poc.run(options))

    assert result == {
        "valid": True,
        "run_id": "synthetic-poc-test",
        "fixture_count": 30,
        "prediction_count": 30,
        "success_count": 30,
        "error_count": 0,
        "skipped_count": 0,
        "request_cap": 30,
        "attempts_used": 30,
        "attempts_remaining": 0,
        "decision_eligible": False,
    }
    predictions = [json.loads(line) for line in options.output.read_text().splitlines()]
    assert len(predictions) == 30
    assert {prediction["provider"] for prediction in predictions} == {"myscript"}
    assert {prediction["status"] for prediction in predictions} == {"ok"}
    assert {prediction["normalization_version"] for prediction in predictions} == {
        "v2"
    }
    assert {prediction["output"]["format"] for prediction in predictions} == {
        "latex"
    }
    assert {prediction["output"]["text"] for prediction in predictions} == {
        "x = 3"
    }
    if os.name == "posix" and stat.S_ISREG(options.output.stat().st_mode):
        assert options.output.stat().st_mode & 0o077 == 0


def test_x_case_probe_consumes_only_the_twenty_remaining_run_attempts(
    tmp_path, monkeypatch
):
    tmp_path.chmod(0o700)
    ledger_path = tmp_path / "poc.handwriting-ledger.jsonl"
    ledger = DurableAttemptLedger(
        ledger_path,
        run_id="synthetic-poc-continuation",
        provider="myscript",
        request_cap=50,
    )
    ledger.initialize()
    for _ in range(30):
        ledger.reserve()

    class FakeRecognizer:
        def __init__(self, _settings, *, budget):
            self.budget = budget

        async def recognize(self, _request):
            self.budget.reserve()
            return MyScriptRecognition(
                text="x=3",
                provider_latex="x = 3",
                unreadable=False,
                attempts=1,
                latency_ms=12,
            )

    monkeypatch.setattr(myscript_poc, "MyScriptRecognizer", FakeRecognizer)
    monkeypatch.setenv("MYSCRIPT_APPLICATION_KEY", "synthetic-app-key")
    monkeypatch.setenv("MYSCRIPT_HMAC_KEY", "synthetic-hmac-key")
    options = argparse.Namespace(
        manifest=X_CASE_FIXTURE_ROOT / "manifest.jsonl",
        fixture_root=X_CASE_FIXTURE_ROOT,
        ledger=ledger_path,
        run_id="synthetic-poc-continuation",
        request_cap=50,
        output=tmp_path / "x-case-predictions.jsonl",
        initialize_ledger=False,
    )

    result = asyncio.run(myscript_poc.run(options))

    assert result["fixture_count"] == 20
    assert result["success_count"] == 20
    assert result["attempts_used"] == 50
    assert result["attempts_remaining"] == 0


def test_synthetic_poc_rejects_raw_prediction_output_inside_repository(tmp_path):
    tmp_path.chmod(0o700)
    options = args(tmp_path)
    options.output = Path(__file__).resolve().parent / "forbidden-predictions.jsonl"

    with pytest.raises(EvaluationDataError, match="share one restricted directory"):
        asyncio.run(myscript_poc.run(options))
