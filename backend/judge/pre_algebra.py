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

            verdicts.append(
                LineVerdict(
                    line_number=step.line_number,
                    valid=valid,
                    error_type=None if valid else "arithmetic",
                    detail=None if valid else "Value differs from previous line",
                )
            )

            if valid:
                reference = current

        return verdicts