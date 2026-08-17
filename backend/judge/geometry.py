import re

from sympy import pi, simplify, sqrt

from schemas import LineVerdict, Step
from .calculus import _parse_expression
from .base import Judge


_NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)"

RECTANGLE_AREA_RE = re.compile(
    rf"^rectangle\s+area\s+({_NUMBER})\s*,\s*({_NUMBER})$",
    re.IGNORECASE,
)

RECTANGLE_PERIMETER_RE = re.compile(
    rf"^rectangle\s+perimeter\s+({_NUMBER})\s*,\s*({_NUMBER})$",
    re.IGNORECASE,
)

TRIANGLE_AREA_RE = re.compile(
    rf"^triangle\s+area\s+({_NUMBER})\s*,\s*({_NUMBER})$",
    re.IGNORECASE,
)

CIRCLE_AREA_RE = re.compile(
    rf"^circle\s+area\s+({_NUMBER})$",
    re.IGNORECASE,
)

CIRCLE_CIRCUMFERENCE_RE = re.compile(
    rf"^circle\s+circumference\s+({_NUMBER})$",
    re.IGNORECASE,
)

PYTHAGOREAN_RE = re.compile(
    rf"^pythagorean\s+({_NUMBER})\s*,\s*({_NUMBER})$",
    re.IGNORECASE,
)

TRIANGLE_ANGLE_RE = re.compile(
    rf"^triangle\s+angle\s+({_NUMBER})\s*,\s*({_NUMBER})$",
    re.IGNORECASE,
)


def _parse_geometry_problem(problem: str):
    text = problem.strip()

    match = RECTANGLE_AREA_RE.fullmatch(text)
    if match:
        length = float(match.group(1))
        width = float(match.group(2))
        return "rectangle_area", length * width

    match = RECTANGLE_PERIMETER_RE.fullmatch(text)
    if match:
        length = float(match.group(1))
        width = float(match.group(2))
        return "rectangle_perimeter", 2 * (length + width)

    match = TRIANGLE_AREA_RE.fullmatch(text)
    if match:
        base = float(match.group(1))
        height = float(match.group(2))
        return "triangle_area", 0.5 * base * height

    match = CIRCLE_AREA_RE.fullmatch(text)
    if match:
        radius = float(match.group(1))
        return "circle_area", pi * radius**2

    match = CIRCLE_CIRCUMFERENCE_RE.fullmatch(text)
    if match:
        radius = float(match.group(1))
        return "circle_circumference", 2 * pi * radius

    match = PYTHAGOREAN_RE.fullmatch(text)
    if match:
        leg_a = float(match.group(1))
        leg_b = float(match.group(2))
        return "pythagorean", sqrt(leg_a**2 + leg_b**2)

    match = TRIANGLE_ANGLE_RE.fullmatch(text)
    if match:
        angle_a = float(match.group(1))
        angle_b = float(match.group(2))
        return "triangle_angle", 180 - angle_a - angle_b

    raise ValueError(
        "Supported geometry problems are rectangle area, rectangle perimeter, "
        "triangle area, circle area, circle circumference, pythagorean, "
        "and triangle angle"
    )


def _parse_geometry_step(text: str):
    parsed = _parse_expression(text)

    if getattr(parsed, "free_symbols", None):
        if parsed.free_symbols:
            raise ValueError("Geometry result must be numeric")

    return parsed


class GeometryJudge(Judge[str, Step, LineVerdict]):
    def check(self, problem: str, steps: list[Step]) -> list[LineVerdict]:
        try:
            kind, expected = _parse_geometry_problem(problem)
        except ValueError as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported geometry problem: {exc}",
                )
            ]
        except Exception as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse geometry problem: {exc}",
                )
            ]

        verdicts: list[LineVerdict] = []

        for step in steps:
            try:
                current = _parse_geometry_step(step.latex)
                valid = simplify(current - expected) == 0
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

            verdicts.append(
                LineVerdict(
                    line_number=step.line_number,
                    valid=valid,
                    error_type=None if valid else "geometry_error",
                    detail=None if valid else f"Incorrect {kind}",
                )
            )

        return verdicts