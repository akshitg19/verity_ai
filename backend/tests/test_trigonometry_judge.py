import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.trigonometry import TrigonometryJudge
from schemas import Step


judge = TrigonometryJudge()


def check(problem, *lines):
    steps = [
        Step(line_number=i + 1, latex=text)
        for i, text in enumerate(lines)
    ]
    return judge.check(problem, steps)


def test_exact_unit_circle_value():
    verdicts = check(
        "sin(pi/6)",
        "1/2",
    )

    assert verdicts[0].valid


def test_pythagorean_identity():
    verdicts = check(
        "sin(x)^2 + cos(x)^2",
        "1",
    )

    assert verdicts[0].valid


def test_identity_rearrangement():
    verdicts = check(
        "1 - cos(x)^2",
        "sin(x)^2",
    )

    assert verdicts[0].valid


def test_tangent_identity():
    verdicts = check(
        "tan(x)",
        "sin(x)/cos(x)",
    )

    assert verdicts[0].valid


def test_wrong_identity_is_invalid():
    verdicts = check(
        "sin(x)^2 + cos(x)^2",
        "2",
    )

    assert not verdicts[0].valid


def test_equivalent_trig_equation():
    verdicts = check(
        "2sin(x) = 0",
        "sin(x) = 0",
    )

    assert verdicts[0].valid


def test_non_equivalent_trig_equation():
    verdicts = check(
        "sin(x) = 0",
        "sin(x) = 1",
    )

    assert not verdicts[0].valid


def test_valid_step_becomes_new_reference():
    verdicts = check(
        "1 - cos(x)^2",
        "sin(x)^2",
        "sin(x) * sin(x)",
    )

    assert all(verdict.valid for verdict in verdicts)


def test_wrong_step_does_not_cascade():
    verdicts = check(
        "sin(x)^2 + cos(x)^2",
        "2",
        "1",
    )

    assert not verdicts[0].valid
    assert verdicts[1].valid


def test_malformed_trig_step_returns_parse_error():
    verdicts = check(
        "sin(x)",
        "sin(",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "parse_error"


def test_wrong_exact_trig_value_is_classified():
    verdicts = check(
        "sin(pi/6)",
        "sqrt(3)/2",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "trig_value"


def test_reciprocal_function_mistake_is_classified():
    verdicts = check(
        "sec(x)",
        "cos(x)",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "trig_reciprocal"


def test_reversed_tangent_quotient_is_classified():
    verdicts = check(
        "tan(x)",
        "cos(x)/sin(x)",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "trig_quotient"


def test_trig_sign_error_is_classified():
    verdicts = check(
        "sin(x) + cos(x)",
        "sin(x) - cos(x)",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "trig_sign"


def test_wrong_identity_is_classified():
    verdicts = check(
        "sin(x)^2 + cos(x)^2",
        "2",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "trig_identity"


def test_unexplained_trig_equation_error_falls_back():
    verdicts = check(
        "sin(x) = 0",
        "x = 1",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "trig_algebraic"


def test_textbook_trig_power_notation():
    verdicts = check(
        "sin^2(x) + cos^2(x)",
        "1",
    )

    assert verdicts[0].valid


def test_textbook_trig_power_matches_function_power_notation():
    verdicts = check(
        "sin^2(x)",
        "sin(x)^2",
    )

    assert verdicts[0].valid


def test_higher_trig_power_notation():
    verdicts = check(
        "cos^3(x)",
        "cos(x)^3",
    )

    assert verdicts[0].valid


def test_bare_textbook_trig_power_notation():
    verdicts = check(
        "sin^2 x",
        "sin(x)^2",
    )

    assert verdicts[0].valid


def test_bare_pythagorean_identity_notation():
    verdicts = check(
        "sin^2 x + cos^2 x",
        "1",
    )

    assert verdicts[0].valid