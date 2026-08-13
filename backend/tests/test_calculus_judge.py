import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.calculus import CalculusJudge
from schemas import Step


judge = CalculusJudge()


def check(problem, *lines):
    steps = [
        Step(line_number=i + 1, latex=text)
        for i, text in enumerate(lines)
    ]
    return judge.check(problem, steps)


def test_basic_derivative():
    verdicts = check(
        "d/dx x^2",
        "2*x",
    )

    assert verdicts[0].valid


def test_derivative_of_trig_function():
    verdicts = check(
        "d/dx sin(x)",
        "cos(x)",
    )

    assert verdicts[0].valid


def test_wrong_derivative_is_invalid():
    verdicts = check(
        "d/dx x^2",
        "x",
    )

    assert not verdicts[0].valid


def test_basic_limit():
    verdicts = check(
        "lim x to 0 sin(x)/x",
        "1",
    )

    assert verdicts[0].valid


def test_wrong_limit_is_invalid():
    verdicts = check(
        "lim x to 0 sin(x)/x",
        "0",
    )

    assert not verdicts[0].valid


def test_indefinite_integral():
    verdicts = check(
        "int x^2 dx",
        "x^3/3",
    )

    assert verdicts[0].valid


def test_indefinite_integral_equivalent_form():
    verdicts = check(
        "int 2*x dx",
        "x^2",
    )

    assert verdicts[0].valid


def test_wrong_indefinite_integral_is_invalid():
    verdicts = check(
        "int x^2 dx",
        "x^2/2",
    )

    assert not verdicts[0].valid


def test_definite_integral():
    verdicts = check(
        "int 0 to 1 x^2 dx",
        "1/3",
    )

    assert verdicts[0].valid


def test_wrong_definite_integral_is_invalid():
    verdicts = check(
        "int 0 to 1 x^2 dx",
        "1/2",
    )

    assert not verdicts[0].valid


def test_valid_step_becomes_new_reference():
    verdicts = check(
        "d/dx x^3",
        "3*x^2",
        "x^2 + x^2 + x^2",
    )

    assert all(verdict.valid for verdict in verdicts)


def test_wrong_step_does_not_cascade():
    verdicts = check(
        "d/dx x^2",
        "x",
        "2*x",
    )

    assert not verdicts[0].valid
    assert verdicts[1].valid


def test_malformed_calculus_step_returns_parse_error():
    verdicts = check(
        "d/dx x^2",
        "sin(",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "parse_error"

def test_indefinite_integral_without_constant_is_valid_but_warned():
    verdicts = check(
        "int x^2 dx",
        "x^3/3",
    )

    assert verdicts[0].valid
    assert verdicts[0].error_type is None
    assert verdicts[0].warning_type == "missing_constant_of_integration"


def test_indefinite_integral_with_c_is_fully_valid():
    verdicts = check(
        "int x^2 dx",
        "x^3/3 + C",
    )

    assert verdicts[0].valid
    assert verdicts[0].error_type is None
    assert verdicts[0].warning_type is None


def test_specific_numeric_constant_is_valid_but_warned():
    verdicts = check(
        "int x^2 dx",
        "x^3/3 + 5",
    )

    assert verdicts[0].valid
    assert verdicts[0].warning_type == "missing_constant_of_integration"


def test_wrong_antiderivative_is_invalid():
    verdicts = check(
        "int x^2 dx",
        "x^2/2 + C",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "integral_rule"


def test_power_rule_error_is_classified():
    verdicts = check(
        "d/dx x^3",
        "x^2",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "derivative_power_rule"


def test_product_rule_error_is_classified():
    verdicts = check(
        "d/dx x*sin(x)",
        "sin(x)",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "derivative_product_rule"


def test_chain_rule_error_is_classified():
    verdicts = check(
        "d/dx sin(x^2)",
        "cos(x^2)",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "derivative_chain_rule"


def test_sum_rule_error_is_classified():
    verdicts = check(
        "d/dx (x^2 + x^3)",
        "2*x",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "derivative_sum_rule"


def test_trig_derivative_error_is_classified():
    verdicts = check(
        "d/dx sin(x)",
        "-cos(x)",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "derivative_trig_rule"


def test_generic_derivative_error_falls_back():
    verdicts = check(
        "d/dx exp(x)",
        "x",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "derivative_rule"


def test_wrong_limit_is_classified():
    verdicts = check(
        "lim x to 0 sin(x)/x",
        "0",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "limit_evaluation"


def test_wrong_definite_integral_is_classified():
    verdicts = check(
        "int 0 to 1 x^2 dx",
        "1/2",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "integral_rule"


def test_bad_step_after_correct_derivative_is_calculus_algebraic():
    verdicts = check(
        "d/dx x^2",
        "2*x",
        "3*x",
    )

    assert verdicts[0].valid
    assert not verdicts[1].valid
    assert verdicts[1].error_type == "calculus_algebraic"


def test_derivative_accepts_textbook_trig_power_notation():
    verdicts = check(
        "d/dx sin^2(x)",
        "2*sin(x)*cos(x)",
    )

    assert verdicts[0].valid


def test_derivative_accepts_higher_trig_power_notation():
    verdicts = check(
        "d/dx cos^3(x)",
        "-3*cos(x)^2*sin(x)",
    )

    assert verdicts[0].valid


def test_y_definition_accepts_leibniz_notation():
    verdicts = check(
        "y = x^2",
        "dy/dx = 2*x",
    )

    assert verdicts[0].valid


def test_y_definition_accepts_prime_notation():
    verdicts = check(
        "y = x^2",
        "y' = 2*x",
    )

    assert verdicts[0].valid


def test_y_definition_accepts_unicode_prime_notation():
    verdicts = check(
        "y = x^2",
        "y′ = 2*x",
    )

    assert verdicts[0].valid


def test_function_definition_accepts_prime_notation():
    verdicts = check(
        "f(x) = x^3",
        "f'(x) = 3*x^2",
    )

    assert verdicts[0].valid


def test_function_definition_accepts_leibniz_notation():
    verdicts = check(
        "f(x) = sin(x)",
        "df/dx = cos(x)",
    )

    assert verdicts[0].valid


def test_wrong_dydx_power_rule_is_classified():
    verdicts = check(
        "y = x^3",
        "dy/dx = x^2",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "derivative_power_rule"


def test_wrong_function_name_is_rejected():
    verdicts = check(
        "y = x^2",
        "df/dx = 2*x",
    )

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "parse_error"