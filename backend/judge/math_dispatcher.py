from schemas import LineVerdict, MathTopic, Step

from .algebra import AlgebraJudge
from .pre_algebra import PreAlgebraJudge
from .trigonometry import TrigonometryJudge
from .calculus import CalculusJudge


class MathJudgeDispatcher:
    def __init__(self) -> None:
        self._judges = {
            "pre_algebra": PreAlgebraJudge(),
            "algebra": AlgebraJudge(),
            "trigonometry": TrigonometryJudge(),
            "calculus": CalculusJudge(),
        }

    def check(
        self,
        topic: MathTopic,
        problem: str,
        steps: list[Step],
    ) -> list[LineVerdict]:
        judge = self._judges.get(topic)

        if judge is None:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Math topic '{topic}' is not implemented yet",
                )
            ]

        return judge.check(problem, steps)