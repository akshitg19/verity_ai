import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.pre_algebra import PreAlgebraJudge
from schemas import Step


judge = PreAlgebraJudge()


def check(problem, *lines):
    steps = [
        Step(line_number=index + 1, latex=text)
        for index, text in enumerate(lines)
    ]
    return judge.check(problem, steps)


def test_valid_integer_arithmetic():
    verdicts = check(
        "12 + 4 * 3",
        "12 + 12",
        "24",
    )

    assert len(verdicts) == 2
    assert all(verdict.valid for verdict in verdicts)


def test_valid_fraction_arithmetic():
    verdicts = check(
        "3/4 + 1/8",
        "6/8 + 1/8",
        "7/8",
    )

    assert len(verdicts) == 2
    assert all(verdict.valid for verdict in verdicts)


def test_wrong_arithmetic_step_is_invalid():
    verdicts = check(
        "3/4 + 1/8",
        "5/8",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "fraction"


def test_valid_square_root_arithmetic():
    verdicts = check(
        "sqrt(49)",
        "7",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_valid_percent_arithmetic():
    verdicts = check(
        "25% * 80",
        "20",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_percent_can_be_rewritten_as_decimal():
    verdicts = check(
        "25% * 80",
        "0.25 * 80",
        "20",
    )

    assert len(verdicts) == 2
    assert all(verdict.valid for verdict in verdicts)


def test_symbolic_expression_is_supported():
    verdicts = check(
        "2x + 4",
        "2x + 4",
    )

    assert len(verdicts) == 1
    assert verdicts[0].line_number == 1
    assert verdicts[0].valid is True
    assert verdicts[0].error_type is None


def test_numeric_equation_is_supported():
    verdicts = check(
        "3 + 4 = 7",
        "7 = 7",
    )

    assert len(verdicts) == 1
    assert verdicts[0].line_number == 1
    assert verdicts[0].valid is True
    assert verdicts[0].error_type is None


def test_basic_one_step_equation():
    verdicts = check(
        "x + 5 = 12",
        "x = 7",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_basic_two_step_equation():
    verdicts = check(
        "3x + 4 = 19",
        "3x = 15",
        "x = 5",
    )

    assert len(verdicts) == 2
    assert all(verdict.valid for verdict in verdicts)


def test_proportion():
    verdicts = check(
        "3/4 = x/20",
        "15 = x",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_percent_equation():
    verdicts = check(
        "20% * x = 10",
        "x = 50",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_combine_like_terms():
    verdicts = check(
        "3x + 2x",
        "5x",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_distributive_property():
    verdicts = check(
        "2(x + 3)",
        "2x + 6",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_wrong_symbolic_simplification_is_invalid():
    verdicts = check(
        "3x + 2x",
        "6x",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is False


def test_basic_inequality():
    verdicts = check(
        "x + 3 > 7",
        "x > 4",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_inequality_negative_multiplier_flips_sign():
    verdicts = check(
        "-2x < 6",
        "x > -3",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is True


def test_inequality_missing_sign_flip_is_invalid():
    verdicts = check(
        "-2x < 6",
        "x < -3",
    )

    assert len(verdicts) == 1
    assert verdicts[0].valid is False


def test_equivalent_inequality_transformation():
    verdicts = check(
        "3x + 2 <= 11",
        "3x <= 9",
        "x <= 3",
    )

    assert len(verdicts) == 2
    assert all(verdict.valid for verdict in verdicts)


def test_order_of_operations_error_is_classified():
    verdicts = check(
        "12 + 4 * 3",
        "48",
    )

    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "order_of_operations"


def test_fraction_error_is_classified():
    verdicts = check(
        "3/4 + 1/8",
        "5/8",
    )

    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "fraction"


def test_exponent_error_is_classified():
    verdicts = check(
        "2^3",
        "6",
    )

    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "exponent"


def test_distribution_error_is_classified():
    verdicts = check(
        "2(x + 3)",
        "2x + 3",
    )

    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "distribution"


def test_plain_arithmetic_remains_arithmetic():
    verdicts = check(
        "12 + 7",
        "20",
    )

    assert verdicts[0].valid is False
    assert verdicts[0].error_type == "arithmetic"