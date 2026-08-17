import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.geometry import GeometryJudge
from schemas import Step


judge = GeometryJudge()


def check(problem, *lines):
    steps = [
        Step(line_number=index + 1, latex=text)
        for index, text in enumerate(lines)
    ]
    return judge.check(problem, steps)


def test_rectangle_area():
    verdicts = check(
        "rectangle area 8, 5",
        "40",
    )

    assert verdicts[0].valid is True


def test_rectangle_perimeter():
    verdicts = check(
        "rectangle perimeter 8, 5",
        "26",
    )

    assert verdicts[0].valid is True


def test_triangle_area():
    verdicts = check(
        "triangle area 10, 6",
        "30",
    )

    assert verdicts[0].valid is True


def test_circle_area_exact_pi():
    verdicts = check(
        "circle area 3",
        "9*pi",
    )

    assert verdicts[0].valid is True


def test_circle_circumference():
    verdicts = check(
        "circle circumference 4",
        "8*pi",
    )

    assert verdicts[0].valid is True


def test_pythagorean():
    verdicts = check(
        "pythagorean 3, 4",
        "sqrt(25)",
        "5",
    )

    assert len(verdicts) == 2
    assert all(verdict.valid for verdict in verdicts)


def test_triangle_angle():
    verdicts = check(
        "triangle angle 50, 60",
        "70",
    )

    assert verdicts[0].valid is True


def test_wrong_geometry_answer():
    verdicts = check(
        "rectangle area 8, 5",
        "45",
    )

    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "geometry_error"


def test_bad_geometry_problem_is_unsupported():
    verdicts = check(
        "find the area of this shape",
        "12",
    )

    assert verdicts[0].line_number == 0
    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "unsupported"