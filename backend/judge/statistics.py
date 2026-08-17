from statistics import mean, median, multimode

from schemas import LineVerdict, Step
from .algebra import _parse_equation
from .base import Judge


def _parse_number_list(text: str) -> list[float]:
    cleaned = (
        text.replace("[", "")
        .replace("]", "")
        .replace("(", "")
        .replace(")", "")
    )

    parts = [part.strip() for part in cleaned.split(",") if part.strip()]

    if not parts:
        raise ValueError("No values found")

    return [float(part) for part in parts]


def _parse_stat_problem(problem: str):
    lowered = problem.lower().strip()

    if lowered.startswith("mean of "):
        values = _parse_number_list(problem[8:])
        return "mean", values

    if lowered.startswith("median of "):
        values = _parse_number_list(problem[10:])
        return "median", values

    if lowered.startswith("mode of "):
        values = _parse_number_list(problem[8:])
        return "mode", values

    if lowered.startswith("range of "):
        values = _parse_number_list(problem[9:])
        return "range", values

    raise ValueError(
        "Statistics problems must begin with mean of, median of, mode of, or range of"
    )


def _expected_value(kind: str, values: list[float]):
    if kind == "mean":
        return mean(values)

    if kind == "median":
        return median(values)

    if kind == "mode":
        modes = multimode(values)

        if len(modes) != 1:
            raise ValueError("Problem does not have a unique mode")

        return modes[0]

    if kind == "range":
        return max(values) - min(values)

    raise ValueError(f"Unsupported statistics operation: {kind}")


def _numeric_value(text: str) -> float:
    parsed = _parse_equation(text)

    if getattr(parsed, "free_symbols", None):
        if parsed.free_symbols:
            raise ValueError("Expected a numeric result")

    return float(parsed)


def _is_sorted_data_step(text: str, original_values: list[float]) -> bool:
    try:
        values = _parse_number_list(text)
    except Exception:
        return False

    return values == sorted(original_values)


class StatisticsJudge(Judge[str, Step, LineVerdict]):
    def check(self, problem: str, steps: list[Step]) -> list[LineVerdict]:
        try:
            kind, values = _parse_stat_problem(problem)
            expected = _expected_value(kind, values)
        except ValueError as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported statistics problem: {exc}",
                )
            ]
        except Exception as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse statistics problem: {exc}",
                )
            ]

        verdicts: list[LineVerdict] = []

        for step in steps:
            if kind == "median" and _is_sorted_data_step(step.latex, values):
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=True,
                    )
                )
                continue

            try:
                current = _numeric_value(step.latex)
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

            valid = abs(current - float(expected)) < 1e-9

            verdicts.append(
                LineVerdict(
                    line_number=step.line_number,
                    valid=valid,
                    error_type=None if valid else "statistics_error",
                    detail=None if valid else f"Incorrect {kind}",
                )
            )

        return verdicts