import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.math_dispatcher import MathJudgeDispatcher
from schemas import Step

def test_dispatcher_routes_algebra():
    dispatcher = MathJudgeDispatcher()

    verdicts = dispatcher.check(
        topic="algebra",
        problem="2x + 4 = 10",
        steps=[
            Step(line_number=1, latex="2x = 6"),
            Step(line_number=2, latex="x = 3"),
        ],
    )

    assert len(verdicts) == 2
    assert all(verdict.valid for verdict in verdicts)


def test_dispatcher_routes_pre_algebra():
    dispatcher = MathJudgeDispatcher()

    verdicts = dispatcher.check(
        topic="pre_algebra",
        problem="3 + 4",
        steps=[
            Step(line_number=1, latex="7"),
        ],
    )

    assert len(verdicts) == 1
    assert verdicts[0].line_number == 1
    assert verdicts[0].valid is True
    assert verdicts[0].error_type is None


def test_dispatcher_returns_unsupported_for_unimplemented_topic():
    dispatcher = MathJudgeDispatcher()

    verdicts = dispatcher.check(
        topic="geometry",
        problem="3 + 4",
        steps=[
            Step(line_number=1, latex="7"),
        ],
    )

    assert len(verdicts) == 1
    assert verdicts[0].line_number == 0
    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "unsupported"