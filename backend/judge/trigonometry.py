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
    cot,
    csc,
    pi,
    sec,
    simplify,
    sin,
    sqrt,
    tan,
    trigsimp,
    Function,
    preorder_traversal,
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
    "sec": sec,
    "csc": csc,
    "cot": cot,
    "sqrt": sqrt,
    "pi": pi,
}

ALLOWED_FUNCTIONS = {
    "sin": sin,
    "cos": cos,
    "tan": tan,
    "sec": sec,
    "csc": csc,
    "cot": cot,
    "sqrt": sqrt,
}


def _parse_expression(text: str):
    text = normalize_math_notation(text)

    if not text:
        raise ValueError("empty trigonometric expression")

    local_dict = {
        "x": Symbol("x"),
        "theta": Symbol("theta"),
        "pi": pi,
        **ALLOWED_FUNCTIONS,
    }

    return parse_expr(
        text,
        local_dict=local_dict,
        global_dict=SAFE_GLOBALS.copy(),
        transformations=TRANSFORMS,
        evaluate=True,
    )


def _parse_math(text: str):
    if text.count("=") > 1:
        raise ValueError("trigonometry input must contain at most one equals sign")

    if "=" not in text:
        return _parse_expression(text)

    lhs_text, rhs_text = text.split("=", 1)

    if not lhs_text.strip() or not rhs_text.strip():
        raise ValueError("equation must have both a left and right side")

    return Eq(
        _parse_expression(lhs_text),
        _parse_expression(rhs_text),
        evaluate=False,
    )


def _expressions_equivalent(first, second) -> bool:
    try:
        return trigsimp(simplify(first - second)) == 0
    except Exception:
        return False


def _equations_equivalent(first: Eq, second: Eq) -> bool:
    """
    Treat two equations as equivalent when their zero-form expressions
    differ only by a nonzero constant factor.

    Example:
        sin(x) = 0
        2*sin(x) = 0

    both describe the same equation.
    """
    try:
        first_diff = trigsimp(simplify(first.lhs - first.rhs))
        second_diff = trigsimp(simplify(second.lhs - second.rhs))

        if first_diff == 0 and second_diff == 0:
            return True

        if first_diff == 0 or second_diff == 0:
            return False

        ratio = trigsimp(simplify(first_diff / second_diff))

        return bool(ratio.is_constant() and ratio != 0)
    except Exception:
        return False


def _equivalent(first, second) -> bool:
    if isinstance(first, Eq) and isinstance(second, Eq):
        return _equations_equivalent(first, second)

    if isinstance(first, Eq) or isinstance(second, Eq):
        return False

    return _expressions_equivalent(first, second)


# ---------------------------------------------------------------------------
# Error classification.
#
# Specific categories are emitted only when a deterministic repair turns
# the student's line into an expression/equation equivalent to the reference.
# If no narrow diagnosis can be proven, fall back to trig_algebraic.
# ---------------------------------------------------------------------------

TRIG_FUNCTIONS = {sin, cos, tan, sec, csc, cot}

RECIPROCAL_FUNCTION = {
    sin: csc,
    csc: sin,
    cos: sec,
    sec: cos,
    tan: cot,
    cot: tan,
}


def _trig_nodes(expression):
    return [
        node
        for node in expression.atoms(Function)
        if node.func in TRIG_FUNCTIONS
    ]


def _contains_trig(expression) -> bool:
    return bool(_trig_nodes(expression))


def _is_trig_sign_error(reference, current) -> bool:
    """Would flipping exactly one additive term's sign repair the line?"""

    if isinstance(current, Eq):
        for side_name in ("lhs", "rhs"):
            side = getattr(current, side_name)
            other = current.rhs if side_name == "lhs" else current.lhs

            for term in Add.make_args(side):
                flipped = side - 2 * term
                candidate = (
                    Eq(flipped, other, evaluate=False)
                    if side_name == "lhs"
                    else Eq(other, flipped, evaluate=False)
                )

                if _equivalent(reference, candidate):
                    return True

        return False

    for term in Add.make_args(current):
        candidate = current - 2 * term

        if _equivalent(reference, candidate):
            return True

    return False


def _is_reciprocal_error(reference, current) -> bool:
    """Detect confusing a trig function with its reciprocal function.

    Examples:
        sec(x) -> cos(x)
        csc(x) -> sin(x)
        cot(x) -> tan(x)
    """

    for node in _trig_nodes(current):
        replacement_function = RECIPROCAL_FUNCTION.get(node.func)

        if replacement_function is None:
            continue

        replacement = replacement_function(*node.args)
        candidate = current.xreplace({node: replacement})

        if _equivalent(reference, candidate):
            return True

    return False


def _is_quotient_error(reference, current) -> bool:
    """Detect a reversed sine/cosine quotient.

    Correct:
        tan(x) = sin(x) / cos(x)
        cot(x) = cos(x) / sin(x)

    This catches the common reversed versions when replacing exactly that
    quotient repairs the student's line.
    """

    for node in preorder_traversal(current):
        if not getattr(node, "is_Mul", False):
            continue

        numerator, denominator = node.as_numer_denom()

        if (
            getattr(numerator, "func", None) == cos
            and getattr(denominator, "func", None) == sin
            and numerator.args == denominator.args
        ):
            replacement = tan(*numerator.args)
            candidate = current.xreplace({node: replacement})

            if _equivalent(reference, candidate):
                return True

        if (
            getattr(numerator, "func", None) == sin
            and getattr(denominator, "func", None) == cos
            and numerator.args == denominator.args
        ):
            replacement = cot(*numerator.args)
            candidate = current.xreplace({node: replacement})

            if _equivalent(reference, candidate):
                return True

    return False


def _is_exact_trig_value_problem(reference, current, reference_text: str) -> bool:
    """A fully numeric trig evaluation with the wrong exact value."""

    trig_names = ("sin", "cos", "tan", "sec", "csc", "cot")

    if not any(f"{name}(" in reference_text.lower() for name in trig_names):
        return False

    if isinstance(reference, Eq) or isinstance(current, Eq):
        return False

    return not reference.free_symbols and not current.free_symbols


def _is_identity_problem(reference) -> bool:
    """Whether the reference represents a symbolic trig identity."""

    if isinstance(reference, Eq):
        try:
            return (
                bool(reference.free_symbols)
                and _contains_trig(reference)
                and trigsimp(simplify(reference.lhs - reference.rhs)) == 0
            )
        except Exception:
            return False

    return bool(reference.free_symbols) and _contains_trig(reference)


def _classify_trig_error(
    reference,
    current,
    reference_text: str,
) -> tuple[str, str]:
    """Return the narrowest deterministic diagnosis we can prove."""

    if _is_trig_sign_error(reference, current):
        return (
            "trig_sign",
            "Flipping the sign of one term makes this trig step equivalent",
        )

    if _is_reciprocal_error(reference, current):
        return (
            "trig_reciprocal",
            "Replacing one trig function with its reciprocal repairs this step",
        )

    if _is_quotient_error(reference, current):
        return (
            "trig_quotient",
            "Correcting a sine/cosine quotient repairs this step",
        )

    if _is_exact_trig_value_problem(reference, current, reference_text):
        return (
            "trig_value",
            "The exact value of this trigonometric expression is incorrect",
        )

    if _is_identity_problem(reference):
        return (
            "trig_identity",
            "The written transformation does not preserve the trig identity",
        )

    return (
        "trig_algebraic",
        "The trig step is not equivalent to the previous valid line",
    )


class TrigonometryJudge(Judge[str, Step, LineVerdict]):
    def check(self, problem: str, steps: list[Step]) -> list[LineVerdict]:
        verdicts: list[LineVerdict] = []

        try:
            reference = _parse_math(problem)
            reference_text = problem
        except Exception as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse trigonometry problem: {exc}",
                )
            ]

        for step in steps:
            try:
                current = _parse_math(step.latex)
            except Exception as exc:
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=f"Could not parse trigonometry step: {exc}",
                    )
                )
                continue

            valid = _equivalent(reference, current)

            if valid:
                error_type = None
                detail = None
            else:
                error_type, detail = _classify_trig_error(
                    reference,
                    current,
                    reference_text,
                )

            verdicts.append(
                LineVerdict(
                    line_number=step.line_number,
                    valid=valid,
                    error_type=error_type,
                    detail=detail,
                )
            )

            # Same behavior as Algebra:
            # a wrong line does not become the reference for later work.
            if valid:
                reference = current
                reference_text = step.latex

        return verdicts