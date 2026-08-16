import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest

from handwriting_eval.cli import main
from handwriting_eval.ledger import AttemptLedgerError, DurableAttemptLedger
from myscript_recognition import (
    MyScriptRecognitionError,
    MyScriptRecognizer,
    MyScriptSettings,
)
from schemas import MyScriptRecognizeRequest


def recognize_request():
    return MyScriptRecognizeRequest(
        schema_version=1,
        profile="linear-equation-v1",
        strokes=[
            {
                "pointer_type": "pen",
                "points": [
                    {"x": 10, "y": 30, "t": 100, "p": 0.2},
                    {"x": 12, "y": 32, "t": 101, "p": 0.3},
                ],
            }
        ],
    )


def settings(*, request_cap=650):
    return MyScriptSettings(
        enabled=True,
        application_key="synthetic-application-key",
        hmac_key="synthetic-hmac-key",
        request_cap=request_cap,
    )


def success_response(label="x = 3"):
    return httpx.Response(
        200,
        headers={"Content-Type": "application/x-latex"},
        content=label.encode("utf-8"),
    )


def ledger_path(tmp_path):
    return tmp_path / "myscript-poc.handwriting-ledger.jsonl"


def ledger(tmp_path, *, cap=3, run_id="myscript-test-run"):
    return DurableAttemptLedger(
        ledger_path(tmp_path),
        run_id=run_id,
        provider="myscript",
        request_cap=cap,
    )


def test_ledger_survives_new_instances_and_stores_content_free_records(tmp_path):
    first = ledger(tmp_path)
    assert first.initialize().used == 0
    assert first.reserve() == 1

    restarted = ledger(tmp_path)
    assert restarted.status().used == 1
    assert restarted.reserve() == 2
    assert restarted.status().remaining == 1

    records = [
        json.loads(line)
        for line in ledger_path(tmp_path).read_text(encoding="ascii").splitlines()
    ]
    assert records == [
        {
            "provider": "myscript",
            "request_cap": 3,
            "run_id": "myscript-test-run",
            "schema_version": 1,
            "type": "attempt_ledger",
        },
        {"sequence": 1, "type": "attempt_reserved"},
        {"sequence": 2, "type": "attempt_reserved"},
    ]
    serialized = json.dumps(records)
    for forbidden in (
        "fixture_id",
        "strokes",
        "image",
        "transcription",
        "expected",
        "student",
        str(tmp_path),
    ):
        assert forbidden not in serialized
    assert str(tmp_path) not in repr(restarted)


def test_ledger_stops_before_attempt_over_cap(tmp_path):
    budget = ledger(tmp_path, cap=1)
    budget.initialize()
    assert budget.reserve() == 1

    with pytest.raises(AttemptLedgerError, match="request_cap_exhausted"):
        budget.reserve()

    assert budget.status().used == 1


def test_myscript_cap_cannot_exceed_650(tmp_path):
    with pytest.raises(AttemptLedgerError, match="request_cap_invalid"):
        ledger(tmp_path, cap=651)


def test_ledger_rejects_repository_relative_or_missing_parent_paths(tmp_path):
    with pytest.raises(AttemptLedgerError, match="ledger_path_invalid"):
        DurableAttemptLedger(
            "relative.handwriting-ledger.jsonl",
            run_id="test-run",
            provider="myscript",
            request_cap=1,
        )
    with pytest.raises(AttemptLedgerError, match="ledger_parent_missing"):
        DurableAttemptLedger(
            tmp_path / "missing" / "test.handwriting-ledger.jsonl",
            run_id="test-run",
            provider="myscript",
            request_cap=1,
        )
    repository_path = Path(__file__).resolve().parents[2] / "test.handwriting-ledger.jsonl"
    with pytest.raises(AttemptLedgerError, match="ledger_inside_repository"):
        DurableAttemptLedger(
            repository_path,
            run_id="test-run",
            provider="myscript",
            request_cap=1,
        )


@pytest.mark.skipif(os.name != "posix", reason="POSIX mode bits only")
def test_ledger_fails_closed_when_permissions_are_too_broad(tmp_path):
    budget = ledger(tmp_path)
    budget.initialize()
    ledger_path(tmp_path).chmod(0o644)

    with pytest.raises(AttemptLedgerError, match="ledger_permissions_invalid"):
        budget.status()


def test_ledger_refuses_a_symbolic_link(tmp_path):
    target = tmp_path / "target.handwriting-ledger.jsonl"
    path = ledger_path(tmp_path)
    target.write_text("not a ledger\n", encoding="ascii")
    try:
        path.symlink_to(target)
    except (NotImplementedError, OSError):
        pytest.skip("symbolic links are unavailable")

    with pytest.raises(AttemptLedgerError) as captured:
        ledger(tmp_path).status()

    assert captured.value.code in {"ledger_symlink_forbidden", "ledger_unavailable"}


def test_existing_lock_fails_closed_without_touching_the_ledger(tmp_path, monkeypatch):
    budget = ledger(tmp_path)
    budget.initialize()
    budget._lock_path.write_text("operator review required\n", encoding="ascii")
    monkeypatch.setattr("handwriting_eval.ledger.LOCK_WAIT_SECONDS", 0)

    with pytest.raises(AttemptLedgerError, match="ledger_locked"):
        budget.reserve()

    assert ledger_path(tmp_path).read_text(encoding="ascii").count("\n") == 1


@pytest.mark.parametrize(
    "extra_line,code",
    [
        (b'{"sequence":9,"type":"attempt_reserved"}\n', "ledger_sequence_invalid"),
        (b'{"sequence":1,"sequence":1,"type":"attempt_reserved"}\n', "ledger_invalid"),
        (b'{"private":"raw handwriting"}', "ledger_invalid"),
    ],
)
def test_ledger_corruption_never_echoes_record_content(tmp_path, extra_line, code):
    budget = ledger(tmp_path)
    budget.initialize()
    with ledger_path(tmp_path).open("ab") as output_file:
        output_file.write(extra_line)

    with pytest.raises(AttemptLedgerError) as captured:
        budget.status()

    assert captured.value.code == code
    assert "raw handwriting" not in str(captured.value)


def test_parallel_reservations_are_unique_and_bounded(tmp_path):
    ledger(tmp_path, cap=40).initialize()

    def reserve_once(_index):
        return ledger(tmp_path, cap=40).reserve()

    with ThreadPoolExecutor(max_workers=8) as pool:
        sequences = list(pool.map(reserve_once, range(40)))

    assert sorted(sequences) == list(range(1, 41))
    assert ledger(tmp_path, cap=40).status().remaining == 0


def test_cli_state_is_content_free_and_reservation_persists(tmp_path, capsys):
    path = ledger_path(tmp_path)
    common = [
        "--ledger",
        str(path),
        "--provider",
        "myscript",
        "--run-id",
        "myscript-cli-run",
        "--request-cap",
        "2",
    ]

    assert main(["ledger-init", *common]) == 0
    capsys.readouterr()
    assert main(["ledger-reserve", *common]) == 0
    reserve_output = capsys.readouterr().out
    assert json.loads(reserve_output) == {
        "remaining": 1,
        "sequence": 1,
        "used": 1,
        "valid": True,
    }
    assert str(path) not in reserve_output

    assert main(["ledger-status", *common]) == 0
    assert json.loads(capsys.readouterr().out)["used"] == 1


def test_adapter_reserves_durable_budget_before_each_http_attempt(tmp_path):
    calls = 0

    def handler(_request):
        nonlocal calls
        calls += 1
        return success_response("x = 3")

    durable = ledger(tmp_path, cap=1)
    durable.initialize()
    recognizer = MyScriptRecognizer(
        settings(request_cap=1),
        transport=httpx.MockTransport(handler),
        budget=durable,
    )
    result = asyncio.run(recognizer.recognize(recognize_request()))
    assert result.text == "x=3"
    assert calls == 1

    restarted = MyScriptRecognizer(
        settings(request_cap=1),
        transport=httpx.MockTransport(handler),
        budget=ledger(tmp_path, cap=1),
    )
    with pytest.raises(AttemptLedgerError):
        ledger(tmp_path, cap=1).reserve()
    # The adapter maps ledger failures to content-safe provider failures.
    with pytest.raises(MyScriptRecognitionError) as captured:
        asyncio.run(restarted.recognize(recognize_request()))
    assert getattr(captured.value, "code", None) == "request_cap_exhausted"
    assert captured.value.__context__ is None
    assert calls == 1
