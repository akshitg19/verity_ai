from sympy import Eq, simplify
from sympy.core.relational import Relational

from schemas import LineVerdict, Step
from .algebra import (
    AlgebraJudge,
    UnsupportedMathError,
    _parse_equation,
    _parse_structural,
    _support_reason,
)
from .base import Judge

def _contains_fraction(text: str) -> bool:
    return "/" in text


def _contains_exponent(text: str) -> bool:
    return "^" in text or "**" in text


def _looks_like_distribution(text: str) -> bool:
    compact = text.replace(" ", "")
    return "(" in compact and ")" in compact and any(
        character.isalpha() for character in compact
    )


def _has_mixed_operations(text: str) -> bool:
    compact = text.replace(" ", "")

    has_add_subtract = "+" in compact or "-" in compact[1:]
    has_multiply_divide = "*" in compact or "/" in compact

    return has_add_subtract and has_multiply_divide


def _is_sign_error(reference, current) -> bool:
    try:
        return simplify(reference + current) == 0
    except Exception:
        return False


def _classify_expression_error(
    previous_text: str,
    current_text: str,
    reference,
    current,
) -> str:
    if _contains_fraction(previous_text) or _contains_fraction(current_text):
        return "fraction"

    if _contains_exponent(previous_text) or _contains_exponent(current_text):
        return "exponent"

    if _looks_like_distribution(previous_text):
        return "distribution"

    if _is_sign_error(reference, current):
        return "sign"

    if _has_mixed_operations(previous_text):
        return "order_of_operations"

    return "arithmetic"

class PreAlgebraJudge(Judge[str, Step, LineVerdict]):
    def check(self, problem: str, steps: list[Step]) -> list[LineVerdict]:
        verdicts: list[LineVerdict] = []

        try:
            reference = _parse_equation(problem)
            reference_structural = _parse_structural(problem)
            support_reason = _support_reason(
                reference,
                reference_structural,
                allow_symbolic_expression=True,
            )
        except UnsupportedMathError as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported problem: {exc}",
                )
            ]
        except Exception as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse problem: {exc}",
                )
            ]

        if support_reason:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported problem: {support_reason}",
                )
            ]

        if isinstance(reference, Relational):
            return AlgebraJudge().check(problem, steps)

        allowed_symbols = reference.free_symbols
        previous_text = problem

        for step in steps:
            try:
                current = _parse_equation(step.latex)
                current_structural = _parse_structural(step.latex)
                support_reason = _support_reason(
                    current,
                    current_structural,
                    allowed_symbols=allowed_symbols,
                    allow_symbolic_expression=True,
                )
            except UnsupportedMathError as exc:
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail=str(exc),
                    )
                )
                continue
            except Exception as exc:
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=str(exc),
                    )
                )
                continue

            if support_reason or isinstance(current, Eq):
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail=(
                            support_reason
                            or "Expression steps cannot introduce an equation"
                        ),
                    )
                )
                continue

            try:
                valid = simplify(reference - current) == 0
            except Exception:
                valid = False

            error_type = None

            if not valid:
                error_type = _classify_expression_error(
                    previous_text,
                    step.latex,
                    reference,
                    current,
                )

            verdicts.append(
                LineVerdict(
                    line_number=step.line_number,
                    valid=valid,
                    error_type=error_type,
                    detail=None if valid else "Value differs from previous line",
                )
            )

            if valid:
                reference = current
                previous_text = step.latex

        return verdicts