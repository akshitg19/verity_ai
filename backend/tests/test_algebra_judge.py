import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge import AlgebraJudge
from schemas import Step

judge = AlgebraJudge()


def check(problem, *lines):
    steps = [Step(line_number=i + 1, latex=t) for i, t in enumerate(lines)]
    return judge.check(problem, steps)


# --- valid work ---------------------------------------------------------

def test_valid_two_step_solution():
    v = check("3x - 12 = 2x + 5", "3x = 2x + 17", "x = 17")
    assert all(x.valid for x in v)


def test_valid_rearranged_but_equivalent():
    v = check("3x - 12 = 2x + 5", "x - 17 = 0", "x = 17")
    assert all(x.valid for x in v)


def test_valid_scaled_equation_is_equivalent():
    # multiplying both sides by 2 preserves the solution set
    v = check("x - 3 = 0", "2x - 6 = 0")
    assert v[0].valid


def test_bare_arithmetic_valid():
    v = check("7 + 5", "12")
    assert v[0].valid

def test_numeric_caret_exponent_is_valid():
    v = check("2^3", "8")
    assert v[0].valid


def test_numeric_double_star_exponent_is_valid():
    v = check("3**2", "9")
    assert v[0].valid


def test_numeric_exponent_inside_expression_is_valid():
    v = check("2^3 + 4", "12")
    assert v[0].valid


def test_wrong_numeric_exponent_result_is_invalid():
    v = check("2^3", "6")
    assert not v[0].valid


def test_variable_exponent_remains_unsupported():
    v = check("x^2 = 9", "x = 3")
    assert v[0].line_number == 0
    assert v[0].error_type == "unsupported"

def test_identity_equation_does_not_crash():
    v = check("x = x", "x = x")
    assert v[0].valid


def test_contradictions_preserve_the_empty_solution_set():
    v = check("x = x + 1", "0 = 1")
    assert v[0].valid


def test_constant_true_equations_are_equivalent():
    v = check("1 = 1", "2 = 2")
    assert v[0].valid


def test_true_and_false_constant_equations_are_not_equivalent():
    v = check("1 = 1", "1 = 2")
    assert not v[0].valid


def test_quadratic_problem_is_reported_as_unsupported():
    v = check("x^2 = 1", "x = 1")
    assert v[0].line_number == 0
    assert v[0].error_type == "unsupported"


# --- error classification ----------------------------------------------

def test_sign_error():
    # correct: 3x = 2x + 17; student flipped the constant's sign
    v = check("3x - 12 = 2x + 5", "3x = 2x - 17")
    assert not v[0].valid
    assert v[0].error_type == "sign"


def test_sign_error_on_variable_term():
    v = check("3x - 12 = 2x + 5", "-3x = 2x + 17")
    assert not v[0].valid
    assert v[0].error_type == "sign"


def test_arithmetic_error():
    # Both sides retain the same variable terms while both constants change,
    # which is the judge's deliberately narrow arithmetic-error pattern.
    v = check("3x - 12 = 2x + 5", "3x = 2x + 7")
    assert not v[0].valid
    assert v[0].error_type == "arithmetic"


def test_division_error():
    # 2x = 6 -> student "divided" only the left side
    v = check("2x = 6", "x = 6")
    assert not v[0].valid
    assert v[0].error_type == "division"


def test_distribution_error():
    # 3(x - 4) copied down as 3x - 4
    v = check("3(x - 4) = 2x + 5", "3x - 4 = 2x + 5")
    assert not v[0].valid
    assert v[0].error_type == "distribution"


def test_distribution_with_sign_slip_reported_as_sign():
    # student distributed but wrote +12: one sign flip away from correct
    v = check("3(x - 4) = 2x + 5", "3x + 12 = 2x + 5")
    assert not v[0].valid
    assert v[0].error_type == "sign"


def test_bare_arithmetic_wrong_value():
    v = check("7 + 5", "13")
    assert not v[0].valid
    assert v[0].error_type == "arithmetic"


def test_unrelated_garbage_falls_back_to_algebraic():
    v = check("3x - 12 = 2x + 5", "5x = 40")
    assert not v[0].valid
    assert v[0].error_type == "algebraic"


def test_unrelated_linear_equation_is_not_mislabeled_as_division():
    v = check("x = 2", "3x = 100")
    assert not v[0].valid
    assert v[0].error_type == "algebraic"


def test_unexplained_constant_change_is_not_mislabeled_as_arithmetic():
    v = check("x = 2", "x = 999")
    assert not v[0].valid
    assert v[0].error_type == "algebraic"


def test_solution_equivalent_to_distribution_mistake_is_not_mislabeled():
    v = check("3(x - 4) = 2x + 5", "x = 9")
    assert not v[0].valid
    assert v[0].error_type == "algebraic"


# --- structural failures ------------------------------------------------

def test_parse_error():
    v = check("3x - 12 = 2x + 5", "3x ++ = 5")
    assert not v[0].valid
    assert v[0].error_type == "parse_error"


def test_new_variable_flagged_unsupported():
    # z was never in the problem -- likely a transcription misread of x
    v = check("3x - 12 = 2x + 5", "3z = 2z + 17")
    assert not v[0].valid
    assert v[0].error_type == "unsupported"
    assert "z" in v[0].detail


def test_expression_vs_equation_mismatch():
    v = check("3x - 12 = 2x + 5", "3x")
    assert not v[0].valid
    assert v[0].error_type == "unsupported"


def test_unparseable_problem():
    v = judge.check("][", [Step(line_number=1, latex="x = 1")])
    assert v[0].error_type == "parse_error"
    assert v[0].line_number == 0


def test_parse_expression_payload_is_rejected_without_execution():
    v = check("x = 1", "__import__('os').getcwd() = 1")
    assert not v[0].valid
    assert v[0].error_type == "parse_error"


def test_variable_denominator_is_unsupported_instead_of_cancelled():
    v = check("x = 1", "x(x - 1)/(x - 1) = 1")
    assert not v[0].valid
    assert v[0].error_type == "unsupported"


def test_x_over_x_problem_is_unsupported_instead_of_losing_zero():
    v = check("x/x = 1", "1 = 1")
    assert v[0].line_number == 0
    assert v[0].error_type == "unsupported"


def test_cancelled_nonlinear_problem_is_still_unsupported():
    v = check("x(x - x) + x = 1", "x = 1")
    assert v[0].line_number == 0
    assert v[0].error_type == "unsupported"


def test_cancelled_nonlinear_step_is_still_unsupported():
    v = check("x = 1", "x(x - x) + x = 1")
    assert not v[0].valid
    assert v[0].error_type == "unsupported"


def test_function_problem_is_unsupported():
    v = check("sin(x) = 0", "x = 0")
    assert v[0].line_number == 0
    assert v[0].error_type == "unsupported"


def test_problem_with_multiple_variables_is_unsupported():
    v = check("x + y = 2", "x = 1")
    assert v[0].line_number == 0
    assert v[0].error_type == "unsupported"


def test_cancelled_extra_variable_is_still_unsupported():
    v = check("x = 1", "x + y - y = 1")
    assert not v[0].valid
    assert v[0].error_type == "unsupported"


def test_symbolic_bare_expression_is_unsupported():
    v = check("x = 1", "x")
    assert not v[0].valid
    assert v[0].error_type == "unsupported"


def test_decimal_arithmetic_is_exact():
    v = check("0.1 + 0.2", "0.3")
    assert v[0].valid


def test_multiple_equals_is_parse_error():
    v = check("x = 1", "x = 1 = 1")
    assert not v[0].valid
    assert v[0].error_type == "parse_error"


def test_large_scientific_notation_is_rejected_before_parsing():
    v = check("1", "1e999999999999")
    assert not v[0].valid
    assert v[0].error_type == "unsupported"


def test_multiple_decimal_points_are_not_treated_as_multiplication():
    v = check("0.36", "1.2.3")
    assert not v[0].valid
    assert v[0].error_type == "parse_error"


def test_whitespace_between_numbers_is_not_implicit_multiplication():
    v = check("2", "1 2")
    assert not v[0].valid
    assert v[0].error_type == "parse_error"


def test_floor_division_is_not_accepted_as_student_notation():
    v = check("2", "5//2")
    assert not v[0].valid
    assert v[0].error_type == "parse_error"


def test_function_style_notation_is_not_treated_as_multiplication():
    v = check("f = 1", "f(1) = 1")
    assert not v[0].valid
    assert v[0].error_type == "unsupported"


# --- cascade behavior ---------------------------------------------------

def test_wrong_step_does_not_cascade():
    # line 1 wrong, but line 2 correctly follows from the ORIGINAL problem
    v = check("3x - 12 = 2x + 5", "3x = 2x + 7", "3x = 2x + 17", "x = 17")
    assert not v[0].valid
    assert v[1].valid
    assert v[2].valid


def test_valid_step_becomes_new_reference():
    # line 2 follows from line 1, not directly from the problem statement
    v = check("3x - 12 = 2x + 5", "x - 17 = 0", "x = 17")
    assert v[0].valid and v[1].valid


