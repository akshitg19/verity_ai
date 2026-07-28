from abc import ABC, abstractmethod
from typing import Generic, TypeVar


ProblemT = TypeVar("ProblemT")
StepT = TypeVar("StepT")
VerdictT = TypeVar("VerdictT")


class Judge(ABC, Generic[ProblemT, StepT, VerdictT]):
    """A judge verifies whether each step follows from the previous one.

    Subject-agnostic contract: swap the judge, keep the product.
    """

    @abstractmethod
    def check(self, problem: ProblemT, steps: list[StepT]) -> list[VerdictT]:
        ...
