import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.statistics import StatisticsJudge
from schemas import Step


judge = StatisticsJudge()


def check(problem, *lines):
    steps = [
        Step(line_number=index + 1, latex=text)
        for index, text in enumerate(lines)
    ]
    return judge.check(problem, steps)


def test_mean():
    verdicts = check(
        "mean of 4, 6, 8, 10",
        "7",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_wrong_mean():
    verdicts = check(
        "mean of 4, 6, 8, 10",
        "8",
    )

    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "statistics_error"


def test_median_with_sorted_intermediate_step():
    verdicts = check(
        "median of 9, 3, 7, 5, 1",
        "1, 3, 5, 7, 9",
        "5",
    )

    assert len(verdicts) == 2
    assert all(verdict.valid for verdict in verdicts)


def test_even_length_median():
    verdicts = check(
        "median of 2, 4, 8, 10",
        "6",
    )

    assert verdicts[0].valid is True


def test_mode():
    verdicts = check(
        "mode of 2, 3, 3, 4, 5",
        "3",
    )

    assert verdicts[0].valid is True


def test_non_unique_mode_is_unsupported():
    verdicts = check(
        "mode of 1, 1, 2, 2",
        "1",
    )

    assert verdicts[0].line_number == 0
    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "unsupported"


def test_range():
    verdicts = check(
        "range of 3, 9, 4, 12",
        "9",
    )

    assert verdicts[0].valid is True


def test_bad_problem_format_is_unsupported():
    verdicts = check(
        "average 4, 6, 8",
        "6",
    )

    assert verdicts[0].line_number == 0
    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "unsupported"