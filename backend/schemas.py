from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    Field,
    StringConstraints,
    computed_field,
    model_validator,
)

MathText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=256),
]
SmilesText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2_048),
]
LineNumber = Annotated[int, Field(ge=1, le=1000)]
ErrorType = Literal[
    "sign",
    "arithmetic",
    "division",
    "distribution",
    "algebraic",
    "parse_error",
    "unsupported",
]
VerdictStatus = Literal["valid", "invalid", "unsupported", "parse_error"]


class Step(BaseModel):
    line_number: LineNumber
    latex: MathText  # e.g. "3x - 12 = 2x + 5"


class CheckRequest(BaseModel):
    problem: MathText
    steps: Annotated[list[Step], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class LineVerdict(BaseModel):
    line_number: int  # line 0 is reserved for an invalid/unsupported problem
    valid: bool
    # One of: "sign", "arithmetic", "division", "distribution",
    # "algebraic", "parse_error", "unsupported"
    error_type: ErrorType | None = None
    detail: str | None = None       # machine detail, NOT student-facing

    @computed_field
    @property
    def status(self) -> VerdictStatus:
        """Separate a student mistake from an input or capability limitation."""
        if self.valid:
            return "valid"
        if self.error_type == "unsupported":
            return "unsupported"
        if self.error_type == "parse_error":
            return "parse_error"
        return "invalid"


class CheckResponse(BaseModel):
    verdicts: list[LineVerdict]
    first_wrong_line: int | None = None
    problem_error: Literal["parse_error", "unsupported"] | None = None


# Chemistry intentionally has its own request and verdict models. This keeps
# the established algebra `/check` contract unchanged while preserving the
# same product-level status semantics for the chemistry endpoint.
ChemistryErrorType = Literal[
    "structure_mismatch",
    "wrong_functional_group",
    "parse_error",
    "unsupported",
]


class ChemistryStep(BaseModel):
    line_number: LineNumber
    smiles: SmilesText


class ChemistryCheckRequest(BaseModel):
    target_smiles: SmilesText
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class ChemistryLineVerdict(BaseModel):
    line_number: int  # line 0 is reserved for an invalid target structure
    valid: bool
    error_type: ChemistryErrorType | None = None
    detail: str | None = None  # machine detail, never the target structure

    @computed_field
    @property
    def status(self) -> VerdictStatus:
        if self.valid:
            return "valid"
        if self.error_type == "unsupported":
            return "unsupported"
        if self.error_type == "parse_error":
            return "parse_error"
        return "invalid"


class ChemistryCheckResponse(BaseModel):
    verdicts: list[ChemistryLineVerdict]
    first_wrong_line: int | None = None
    problem_error: Literal["parse_error", "unsupported"] | None = None


class TranscribeRequest(BaseModel):
    image_base64: Annotated[str, Field(min_length=1, max_length=7_000_000)]


class TranscribeResponse(BaseModel):
    text: str
    unreadable: bool = False  # model could not read the line at all


# Hint generation receives no problem or step content, so its input cannot
# accidentally expose a solved value to a template or future model call.
class HintRequest(BaseModel):
    line_number: LineNumber
    error_type: ErrorType | None
    level: Literal[1, 2, 3]


class HintResponse(BaseModel):
    level: int
    hint: str
    max_level: int = 3
