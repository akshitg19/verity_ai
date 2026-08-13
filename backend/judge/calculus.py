import re

from sympy import (
    Add,
    Eq,
    Float,
    Integer,
    Mul,
    Pow,
    Rational,
    Symbol,
    cos,
    diff,
    exp,
    integrate,
    limit,
    log,
    pi,
    simplify,
    sin,
    sqrt,
    tan,
)
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    rationalize,
    standard_transformations,
)

from schemas import LineVerdict, Step
from .base import Judge
from .math_notation import normalize_math_notation


TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
    rationalize,
)

X = Symbol("x")
C = Symbol("C")

SAFE_GLOBALS = {
    "__builtins__": {},
    "Symbol": Symbol,
    "Integer": Integer,
    "Float": Float,
    "Rational": Rational,
    "Add": Add,
    "Mul": Mul,
    "Pow": Pow,
    "sin": sin,
    "cos": cos,
    "tan": tan,
    "sqrt": sqrt,
    "log": log,
    "ln": log,
    "exp": exp,
    "pi": pi,
    "C": C,
}

DERIVATIVE_RE = re.compile(
    r"^d/dx\s+(.+)$",
    re.IGNORECASE,
)

INDEFINITE_INTEGRAL_RE = re.compile(
    r"^int\s+(.+)\s+dx$",
    re.IGNORECASE,
)

DEFINITE_INTEGRAL_RE = re.compile(
    r"^int\s+(.+?)\s+to\s+(.+?)\s+(.+)\s+dx$",
    re.IGNORECASE,
)

LIMIT_RE = re.compile(
    r"^lim\s+x\s+to\s+(.+?)\s+(.+)$",
    re.IGNORECASE,
)

VARIABLE_DEFINITION_RE = re.compile(
    r"^([a-zA-Z])\s*=\s*(.+)$",
)

FUNCTION_DEFINITION_RE = re.compile(
    r"^([a-zA-Z])\(x\)\s*=\s*(.+)$",
)

LEIBNIZ_RESULT_RE = re.compile(
    r"^d([a-zA-Z])/dx\s*=\s*(.+)$",
    re.IGNORECASE,
)

FUNCTION_PRIME_RESULT_RE = re.compile(
    r"^([a-zA-Z])['′]\(x\)\s*=\s*(.+)$",
)

VARIABLE_PRIME_RESULT_RE = re.compile(
    r"^([a-zA-Z])['′]\s*=\s*(.+)$",
)


def _parse_expression(text: str):
    text = normalize_math_notation(text)

    if not text:
        raise ValueError("empty calculus expression")

    local_dict = {
        "x": X,
        "C": C,
        "pi": pi,
        "sin": sin,
        "cos": cos,
        "tan": tan,
        "sqrt": sqrt,
        "log": log,
        "ln": log,
        "exp": exp,
    }

    return parse_expr(
        text,
        local_dict=local_dict,
        global_dict=SAFE_GLOBALS.copy(),
        transformations=TRANSFORMS,
        evaluate=True,
    )


def _derivative_definition(text: str):
    """Return (name, expression) when a problem defines a function.

    Examples:
        y = x^2     -> ("y", x**2)
        f(x) = x^2  -> ("f", x**2)
    """

    text = text.strip()

    function_match = FUNCTION_DEFINITION_RE.fullmatch(text)
    if function_match:
        name = function_match.group(1)
        expression = _parse_expression(function_match.group(2))
        return name, expression

    variable_match = VARIABLE_DEFINITION_RE.fullmatch(text)
    if variable_match:
        name = variable_match.group(1)

        # "x = ..." is an equation, not a definition of a dependent
        # variable for differentiation.
        if name.lower() == "x":
            return None

        expression = _parse_expression(variable_match.group(2))
        return name, expression

    return None


def _expand_derivative_operators(text: str) -> str:
    """Evaluate d/dx (...) operators that appear inside a larger expression."""
    marker = "d/dx"

    while marker in text:
        start = text.find(marker)
        operand_start = start + len(marker)

        while operand_start < len(text) and text[operand_start].isspace():
            operand_start += 1

        if operand_start >= len(text) or text[operand_start] != "(":
            break

        depth = 0
        operand_end = None

        for index in range(operand_start, len(text)):
            if text[index] == "(":
                depth += 1
            elif text[index] == ")":
                depth -= 1

                if depth == 0:
                    operand_end = index
                    break

        if operand_end is None:
            raise ValueError("unclosed derivative expression")

        inner_text = text[operand_start + 1 : operand_end]
        inner_expression = _parse_expression(inner_text)
        derivative = diff(inner_expression, X)

        text = (
            text[:start]
            + f"({derivative})"
            + text[operand_end + 1 :]
        )

    return text


def _parse_derivative_rhs(text: str):
    """Parse the right side of derivative-result notation.

    Supports:
        dy/dx = 2*x
        dy/dx = d/dx cos(x)
        dy/dx = d/dx (cos(x))
        dy/dx = 3 * d/dx (cos(x))
    """
    text = text.strip()

    # If the entire RHS is a derivative operation, the operand may be
    # parenthesized or written naturally without parentheses.
    derivative_match = DERIVATIVE_RE.fullmatch(text)
    if derivative_match:
        expression = _parse_expression(derivative_match.group(1))
        return diff(expression, X)

    # Otherwise evaluate derivative operators embedded inside a larger RHS.
    text = _expand_derivative_operators(text)
    return _parse_expression(text)


def _parse_derivative_result(text: str, expected_name: str):
    """Parse common notation for the derivative of a defined function.

    Examples:
        dy/dx = 2*x
        y' = 2*x
        f'(x) = 2*x

    Returns None when the line is not written as derivative-result notation.
    """

    text = text.strip()

    leibniz_match = LEIBNIZ_RESULT_RE.fullmatch(text)
    if leibniz_match:
        name = leibniz_match.group(1)

        if name.lower() != expected_name.lower():
            raise ValueError(
                f"derivative is written for {name}, "
                f"but the problem defines {expected_name}"
            )

        return _parse_derivative_rhs(leibniz_match.group(2))

    function_prime_match = FUNCTION_PRIME_RESULT_RE.fullmatch(text)
    if function_prime_match:
        name = function_prime_match.group(1)

        if name.lower() != expected_name.lower():
            raise ValueError(
                f"derivative is written for {name}, "
                f"but the problem defines {expected_name}"
            )

        return _parse_derivative_rhs(function_prime_match.group(2))

    variable_prime_match = VARIABLE_PRIME_RESULT_RE.fullmatch(text)
    if variable_prime_match:
        name = variable_prime_match.group(1)

        if name.lower() != expected_name.lower():
            raise ValueError(
                f"derivative is written for {name}, "
                f"but the problem defines {expected_name}"
            )

        return _parse_derivative_rhs(variable_prime_match.group(2))

    return None


def _evaluate_calculus_statement(text: str):
    text = text.strip()

    derivative_match = DERIVATIVE_RE.fullmatch(text)
    if derivative_match:
        expression = _parse_expression(derivative_match.group(1))
        return diff(expression, X)

    definite_match = DEFINITE_INTEGRAL_RE.fullmatch(text)
    if definite_match:
        lower = _parse_expression(definite_match.group(1))
        upper = _parse_expression(definite_match.group(2))
        expression = _parse_expression(definite_match.group(3))

        return integrate(expression, (X, lower, upper))

    indefinite_match = INDEFINITE_INTEGRAL_RE.fullmatch(text)
    if indefinite_match:
        expression = _parse_expression(indefinite_match.group(1))
        return integrate(expression, X)

    limit_match = LIMIT_RE.fullmatch(text)
    if limit_match:
        destination = _parse_expression(limit_match.group(1))
        expression = _parse_expression(limit_match.group(2))

        return limit(expression, X, destination)

    if "=" in text:
        if text.count("=") != 1:
            raise ValueError(
                "calculus equation must contain exactly one equals sign"
            )

        lhs_text, rhs_text = text.split("=", 1)

        return Eq(
            _parse_expression(lhs_text),
            _parse_expression(rhs_text),
            evaluate=False,
        )

    return _parse_expression(text)


def _equivalent(first, second) -> bool:
    try:
        if isinstance(first, Eq) and isinstance(second, Eq):
            first_difference = simplify(first.lhs - first.rhs)
            second_difference = simplify(second.lhs - second.rhs)

            if first_difference == 0 and second_difference == 0:
                return True

            if first_difference == 0 or second_difference == 0:
                return False

            ratio = simplify(first_difference / second_difference)

            return bool(ratio.is_constant() and ratio != 0)

        if isinstance(first, Eq) or isinstance(second, Eq):
            return False

        return simplify(first - second) == 0

    except Exception:
        return False


def _same(first, second) -> bool:
    try:
        return simplify(first - second) == 0
    except Exception:
        return False


def _task_kind(problem: str) -> str:
    text = problem.strip()

    if _derivative_definition(text) is not None:
        return "derivative"

    if DERIVATIVE_RE.fullmatch(text):
        return "derivative"

    if DEFINITE_INTEGRAL_RE.fullmatch(text):
        return "definite_integral"

    if INDEFINITE_INTEGRAL_RE.fullmatch(text):
        return "indefinite_integral"

    if LIMIT_RE.fullmatch(text):
        return "limit"

    return "calculus"


def _derivative_source(problem: str):
    match = DERIVATIVE_RE.fullmatch(problem.strip())

    if match:
        return _parse_expression(match.group(1))

    definition = _derivative_definition(problem)

    if definition is not None:
        _, expression = definition
        return expression

    return None


def _indefinite_integrand(problem: str):
    match = INDEFINITE_INTEGRAL_RE.fullmatch(problem.strip())

    if not match:
        return None

    return _parse_expression(match.group(1))


def _is_antiderivative(integrand, candidate) -> bool:
    """A valid antiderivative differentiates back to the integrand."""

    if isinstance(candidate, Eq):
        return False

    try:
        return simplify(diff(candidate, X) - integrand) == 0
    except Exception:
        return False


def _has_arbitrary_constant(candidate) -> bool:
    """A symbolic constant such as C or K represents the arbitrary constant."""

    if isinstance(candidate, Eq):
        return False

    return bool(candidate.free_symbols - {X})


# ---------------------------------------------------------------------------
# Calculus error classification.
#
# Specific labels are emitted only when deterministic structure supports
# the diagnosis. Otherwise the judge deliberately uses a broader fallback.
# ---------------------------------------------------------------------------


def _is_power_rule_error(source, current) -> bool:
    if not isinstance(source, Pow):
        return False

    base, exponent = source.as_base_exp()

    if base != X or exponent.has(X):
        return False

    expected = exponent * X ** (exponent - 1)

    if _same(current, expected):
        return False

    common_mistakes = (
        X ** (exponent - 1),
        exponent * X ** exponent,
        X ** exponent,
    )

    return any(_same(current, mistake) for mistake in common_mistakes)


def _is_product_rule_error(source, current) -> bool:
    coefficient, rest = source.as_coeff_Mul()
    factors = [
        factor
        for factor in Mul.make_args(rest)
        if factor.has(X)
    ]

    if len(factors) != 2:
        return False

    first, second = factors

    first_term = coefficient * diff(first, X) * second
    second_term = coefficient * first * diff(second, X)
    expected = first_term + second_term

    if _same(current, expected):
        return False

    common_mistakes = (
        first_term,
        second_term,
        coefficient * diff(first, X) * diff(second, X),
    )

    return any(_same(current, mistake) for mistake in common_mistakes)


def _outer_derivative_without_chain(source):
    if source.func == sin and len(source.args) == 1:
        return cos(source.args[0])

    if source.func == cos and len(source.args) == 1:
        return -sin(source.args[0])

    if source.func == tan and len(source.args) == 1:
        return 1 / cos(source.args[0]) ** 2

    if source.func == exp and len(source.args) == 1:
        return exp(source.args[0])

    if source.func == log and len(source.args) == 1:
        return 1 / source.args[0]

    if isinstance(source, Pow):
        base, exponent = source.as_base_exp()

        if base.has(X) and base != X and not exponent.has(X):
            return exponent * base ** (exponent - 1)

    return None


def _is_chain_rule_error(source, current) -> bool:
    outer_only = _outer_derivative_without_chain(source)

    if outer_only is None:
        return False

    if not source.args:
        return False

    inner = source.args[0]

    if inner == X or not inner.has(X):
        return False

    expected = diff(source, X)

    return (
        not _same(current, expected)
        and _same(current, outer_only)
    )


def _is_sum_rule_error(source, current) -> bool:
    if not isinstance(source, Add):
        return False

    terms = Add.make_args(source)

    if len(terms) < 2:
        return False

    derivatives = [diff(term, X) for term in terms]
    expected = Add(*derivatives)

    if _same(current, expected):
        return False

    for index in range(len(derivatives)):
        partial = Add(
            *[
                derivative
                for i, derivative in enumerate(derivatives)
                if i != index
            ]
        )

        if derivatives[index] != 0 and _same(current, partial):
            return True

    return False


def _contains_trig(source) -> bool:
    return (
        source.has(sin)
        or source.has(cos)
        or source.has(tan)
    )


def _classify_calculus_error(
    problem: str,
    current,
    *,
    current_text: str,
    initial_reference: bool,
) -> tuple[str, str]:
    kind = _task_kind(problem)

    if not initial_reference:
        if kind == "limit" and not LIMIT_RE.fullmatch(current_text.strip()):
            return (
                "limit_evaluation",
                "The evaluated limit is incorrect",
            )

        return (
            "calculus_algebraic",
            "This transformation is not equivalent to the previous valid calculus line",
        )

    if kind == "derivative":
        source = _derivative_source(problem)

        if source is None:
            return (
                "derivative_rule",
                "The derivative result is incorrect",
            )

        if _is_power_rule_error(source, current):
            return (
                "derivative_power_rule",
                "The derivative matches a common power-rule mistake",
            )

        if _is_product_rule_error(source, current):
            return (
                "derivative_product_rule",
                "The derivative matches a common product-rule mistake",
            )

        if _is_chain_rule_error(source, current):
            return (
                "derivative_chain_rule",
                "The outer derivative is present but the inner derivative is missing",
            )

        if _is_sum_rule_error(source, current):
            return (
                "derivative_sum_rule",
                "One term appears to have been omitted while differentiating a sum",
            )

        if _contains_trig(source):
            return (
                "derivative_trig_rule",
                "The derivative of a trigonometric function is incorrect",
            )

        return (
            "derivative_rule",
            "The derivative is incorrect, but no narrower rule error was proven",
        )

    if kind in ("indefinite_integral", "definite_integral"):
        return (
            "integral_rule",
            "The integral result does not match the deterministic integral check",
        )

    if kind == "limit":
        return (
            "limit_evaluation",
            "The evaluated limit is incorrect",
        )

    return (
        "calculus_algebraic",
        "The calculus step is not equivalent to the previous valid result",
    )


class CalculusJudge(Judge[str, Step, LineVerdict]):
    def check(self, problem: str, steps: list[Step]) -> list[LineVerdict]:
        verdicts: list[LineVerdict] = []

        try:
            task_kind = _task_kind(problem)
            derivative_definition = _derivative_definition(problem)

            if derivative_definition is not None:
                defined_name, source_expression = derivative_definition
                reference = diff(source_expression, X)
            else:
                defined_name = None
                reference = _evaluate_calculus_statement(problem)

            integrand = (
                _indefinite_integrand(problem)
                if task_kind == "indefinite_integral"
                else None
            )

        except Exception as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse calculus problem: {exc}",
                )
            ]

        has_valid_step = False

        for step in steps:
            try:
                current = None

                if defined_name is not None:
                    current = _parse_derivative_result(
                        step.latex,
                        defined_name,
                    )

                if current is None:
                    current = _evaluate_calculus_statement(step.latex)
            except Exception as exc:
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=f"Could not parse calculus step: {exc}",
                    )
                )
                continue

            if task_kind == "indefinite_integral" and integrand is not None:
                valid = _is_antiderivative(integrand, current)
            else:
                valid = _equivalent(reference, current)

            warning_type = None

            if (
                valid
                and task_kind == "indefinite_integral"
                and not _has_arbitrary_constant(current)
            ):
                warning_type = "missing_constant_of_integration"

            if valid:
                error_type = None
                detail = None
            else:
                error_type, detail = _classify_calculus_error(
                    problem,
                    current,
                    current_text=step.latex,
                    initial_reference=not has_valid_step,
                )

            verdicts.append(
                LineVerdict(
                    line_number=step.line_number,
                    valid=valid,
                    error_type=error_type,
                    warning_type=warning_type,
                    detail=detail,
                )
            )

            if valid:
                reference = current
                has_valid_step = True

        return verdicts