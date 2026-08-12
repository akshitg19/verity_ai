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

# Which engine decided this verdict. Deterministic beats model wherever both
# can speak, and a model verdict must never be presented as a proven one, so
# the provenance rides on the verdict itself rather than being inferred from
# the endpoint that produced it.
JudgedBy = Literal["deterministic", "model"]

# The six chemistry subjects, named the way a student or teacher names them.
# Adding a value to a Literal is an additive change; removing one is not.
ChemistryTopic = Literal[
    "stoichiometry",
    "balancing",
    "redox",
    "solutions",
    "structure",
    "organic",
]

MathTopic = Literal[
    "pre_algebra",
    "algebra",
    "geometry",
    "trigonometry",
    "statistics",
    "calculus",
]


class Step(BaseModel):
    line_number: LineNumber
    latex: MathText  # e.g. "3x - 12 = 2x + 5"


class CheckRequest(BaseModel):
    topic: MathTopic = "algebra"
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
    judged_by: JudgedBy = "deterministic"

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
    "unbalanced_atoms",
    "unbalanced_charge",
    # Added for chemistry subjects 1, 3, 4, and 6. Every value here is a
    # mistake a deterministic engine can prove, not a category a model
    # guessed at, and each one has its own hint fallback in hints.py.
    "wrong_value",
    "wrong_unit",
    "wrong_formula",
    "wrong_species",
    "wrong_oxidation_state",
    "wrong_name",
    "wrong_direction",
    "wrong_coefficients",
    "not_net_ionic",
    "parse_error",
    "unsupported",
]
EquationText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=512),
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
    judged_by: JudgedBy = "deterministic"
    # Set when the model path judged this line and its two independent reads
    # disagreed. The UI asks the student to confirm the line rather than
    # showing a verdict it does not trust.
    needs_confirmation: bool = False

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


class FunctionalGroupCheckRequest(BaseModel):
    # A group name from judge.chemistry.FUNCTIONAL_GROUP_SMARTS, not a SMILES.
    target_group: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
    ]
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class ChemistryEquationStep(BaseModel):
    line_number: LineNumber
    equation: EquationText  # e.g. "2H2 + O2 -> 2H2O"


class BalanceLineVerdict(BaseModel):
    line_number: int  # line 0 is reserved for an invalid reference equation
    valid: bool
    error_type: ChemistryErrorType | None = None
    detail: str | None = None  # machine detail, never the balanced answer
    judged_by: JudgedBy = "deterministic"
    needs_confirmation: bool = False

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


class BalanceCheckRequest(BaseModel):
    reference_equation: EquationText
    steps: Annotated[
        list[ChemistryEquationStep], Field(min_length=1, max_length=50)
    ]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class BalanceCheckResponse(BaseModel):
    verdicts: list[BalanceLineVerdict]
    first_wrong_line: int | None = None
    problem_error: Literal["parse_error", "unsupported"] | None = None


class TranscribeRequest(BaseModel):
    image_base64: Annotated[str, Field(min_length=1, max_length=7_000_000)]


class TranscribeResponse(BaseModel):
    text: str
    unreadable: bool = False  # model could not read the line at all
    # "low" pre-focuses the correction field in the UI. A misread the student
    # fixes in one second is a minor failure; a misread they never notice is
    # how a correct line gets flagged as wrong.
    confidence: Literal["high", "low"] = "high"
    latency_ms: int | None = None


class StructureTranscribeRequest(BaseModel):
    image_base64: Annotated[str, Field(min_length=1, max_length=7_000_000)]


class StructureTranscribeResponse(BaseModel):
    smiles: str
    unreadable: bool = False  # model could not read the drawing at all
    confidence: Literal["high", "low"] = "high"
    latency_ms: int | None = None
    # An RDKit rendering of exactly what we read back, so a student can
    # verify a picture instead of verifying "O=C(*)O*". Never the target
    # structure -- only ever the student's own drawing, re-drawn.
    svg: str | None = None
    # True when the drawing needed R groups (wildcards) to be represented.
    generic: bool = False


class StructureRenderRequest(BaseModel):
    smiles: SmilesText


class StructureRenderResponse(BaseModel):
    svg: str
    formula: str | None = None
    generic: bool = False


# ---------------------------------------------------------------------------
# Chemistry subjects 1, 3, 4, and 6.
#
# One request model per judge rather than one polymorphic model: the fields a
# stoichiometry problem needs and the fields a pH problem needs have nothing
# in common, and a single model with thirty optional fields would validate
# nothing at all.
# ---------------------------------------------------------------------------
FormulaText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=128),
]
StoichiometryTask = Literal[
    "molar_mass",
    "percent_composition",
    "moles_from_mass",
    "mass_from_moles",
    "particles_from_moles",
    "moles_from_particles",
    "empirical_formula",
    "molecular_formula",
    "limiting_reagent",
    "theoretical_yield",
    "percent_yield",
]
SolutionsTask = Literal[
    "molarity",
    "moles_from_molarity",
    "volume_from_molarity",
    "dilution",
    "ph_from_concentration",
    "poh_from_concentration",
    "ph_from_ph",
    "strong_acid_ph",
    "strong_base_ph",
    "weak_acid_ph",
    "weak_base_ph",
    "buffer_ph",
    "titration_concentration",
    "percent_by_mass",
]


class StoichiometryRequest(BaseModel):
    task: StoichiometryTask
    formula: FormulaText | None = None
    element: Annotated[str, StringConstraints(max_length=3)] | None = None
    mass_g: Annotated[float, Field(gt=0, le=1e9)] | None = None
    moles: Annotated[float, Field(gt=0, le=1e9)] | None = None
    particles: Annotated[float, Field(gt=0, le=1e40)] | None = None
    equation: EquationText | None = None
    amounts: dict[FormulaText, Annotated[float, Field(gt=0, le=1e9)]] = Field(
        default_factory=dict, max_length=12
    )
    amounts_in_moles: bool = False
    product: FormulaText | None = None
    actual_yield_g: Annotated[float, Field(ge=0, le=1e9)] | None = None
    composition: dict[
        Annotated[str, StringConstraints(max_length=3)],
        Annotated[float, Field(gt=0, le=1e6)],
    ] = Field(default_factory=dict, max_length=12)
    target_molar_mass: Annotated[float, Field(gt=0, le=1e6)] | None = None
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]
    # The worksheet layout judges one answer box rather than a chain of
    # working lines, so an intermediate quantity is the wrong answer there
    # rather than a legitimate middle step. Defaults false, which is exactly
    # the behaviour every existing caller already gets.
    answers_only: bool = False

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class SolutionsRequest(BaseModel):
    task: SolutionsTask
    formula: FormulaText | None = None
    moles: Annotated[float, Field(gt=0, le=1e9)] | None = None
    mass_g: Annotated[float, Field(gt=0, le=1e9)] | None = None
    volume_l: Annotated[float, Field(gt=0, le=1e6)] | None = None
    concentration_m: Annotated[float, Field(gt=0, le=1e3)] | None = None
    initial_concentration_m: Annotated[float, Field(gt=0, le=1e3)] | None = None
    initial_volume_l: Annotated[float, Field(gt=0, le=1e6)] | None = None
    final_concentration_m: Annotated[float, Field(gt=0, le=1e3)] | None = None
    final_volume_l: Annotated[float, Field(gt=0, le=1e6)] | None = None
    hydrogen_concentration_m: Annotated[float, Field(gt=0, le=1e3)] | None = None
    hydroxide_concentration_m: Annotated[float, Field(gt=0, le=1e3)] | None = None
    ph: Annotated[float, Field(ge=-2, le=18)] | None = None
    ka: Annotated[float, Field(gt=0, le=1e3)] | None = None
    kb: Annotated[float, Field(gt=0, le=1e3)] | None = None
    pka: Annotated[float, Field(ge=-10, le=30)] | None = None
    acid_concentration_m: Annotated[float, Field(gt=0, le=1e3)] | None = None
    base_concentration_m: Annotated[float, Field(gt=0, le=1e3)] | None = None
    protons: Annotated[int, Field(ge=1, le=6)] = 1
    hydroxides: Annotated[int, Field(ge=1, le=6)] = 1
    titrant_concentration_m: Annotated[float, Field(gt=0, le=1e3)] | None = None
    titrant_volume_l: Annotated[float, Field(gt=0, le=1e6)] | None = None
    analyte_volume_l: Annotated[float, Field(gt=0, le=1e6)] | None = None
    solute_mass_g: Annotated[float, Field(gt=0, le=1e9)] | None = None
    solution_mass_g: Annotated[float, Field(gt=0, le=1e9)] | None = None
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class OxidationStateRequest(BaseModel):
    """"What is the oxidation state of X in this formula" -- a rule set,
    not a lookup, so it is fully deterministic."""

    formula: FormulaText
    element: Annotated[str, StringConstraints(min_length=1, max_length=3)]
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class CellPotentialRequest(BaseModel):
    """Standard cell potential from two half-reactions in the table."""

    cathode: EquationText
    anode: EquationText
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class NetIonicRequest(BaseModel):
    molecular_equation: EquationText
    steps: Annotated[
        list[ChemistryEquationStep], Field(min_length=1, max_length=50)
    ]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class NamingRequest(BaseModel):
    """A IUPAC name, resolved to a structure by OPSIN and then compared.

    If OPSIN cannot parse the name that is a `parse_error` -- our limit --
    and never a claim that the student named the compound wrongly.
    """

    target_smiles: SmilesText | None = None
    target_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=256)
    ] | None = None
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def has_a_target(self):
        if not self.target_smiles and not self.target_name:
            raise ValueError("a naming problem needs a target structure or name")
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class FormulaStructureRequest(BaseModel):
    """"Draw a structure with this formula."

    Additive, and looser than IsomerRequest on purpose. A molecular formula
    does not determine a structure: C2H6O is ethanol and it is also dimethyl
    ether, and a student told to draw a structure with that formula is right
    either way. The target is the formula the student wrote, not a SMILES,
    because a student writes `C2H6O` and does not know what SMILES is.
    """

    target_formula: FormulaText
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class IsomerRequest(BaseModel):
    """"Draw an isomer of this" -- same formula, different connectivity."""

    reference_smiles: SmilesText
    # constitutional: same formula, different graph. stereo: same graph,
    # different stereochemistry. any: either counts.
    isomer_type: Literal["constitutional", "stereo", "any"] = "constitutional"
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=50)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class ReactionRequest(BaseModel):
    """Predicting a product or writing a mechanism step.

    The only chemistry path where a model may hold the deciding vote, and it
    is labelled `judged_by="model"` all the way to the UI. Where the claim
    can be checked deterministically -- conservation of atoms between the
    starting material and the proposed product -- it is, and only the
    genuinely unverifiable remainder is left to the model.
    """

    reactants_smiles: Annotated[list[SmilesText], Field(min_length=1, max_length=6)]
    reagent: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=128)
    ] | None = None
    reaction_type: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=64)
    ] | None = None
    steps: Annotated[list[ChemistryStep], Field(min_length=1, max_length=20)]

    @model_validator(mode="after")
    def steps_are_unique_and_ordered(self):
        numbers = [step.line_number for step in self.steps]
        if numbers != sorted(set(numbers)):
            raise ValueError("step line numbers must be unique and increasing")
        return self


class CaptureRequest(BaseModel):
    """One handwritten corpus sample, with ground truth typed at capture time.

    The ground truth is what the person who drew it says they drew, never
    what the model read back. A corpus ground-truthed from model output
    measures nothing.
    """

    image_base64: Annotated[str, Field(min_length=1, max_length=7_000_000)]
    topic: Literal["structure", "functional_group", "balance", "other"] = "structure"
    ground_truth: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)
    ]
    target: Annotated[str, StringConstraints(max_length=512)] | None = None
    expected_verdict: VerdictStatus = "valid"
    note: Annotated[str, StringConstraints(max_length=512)] | None = None


class CaptureResponse(BaseModel):
    saved_as: str
    total_samples: int


class ChemistrySessionRequest(BaseModel):
    """Open a server-side problem session.

    The session holds the answer vault and the level-3 escalation counter.
    Neither is ever returned: the client gets an opaque id and a remaining
    count, and nothing that could carry a solved value.
    """

    topic: ChemistryTopic
    problem: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1024)
    ]
    target_smiles: SmilesText | None = None
    target_group: Annotated[str, StringConstraints(max_length=64)] | None = None
    reference_equation: EquationText | None = None
    stoichiometry: StoichiometryRequest | None = None
    solutions: SolutionsRequest | None = None


class ChemistrySessionResponse(BaseModel):
    session_id: str
    topic: ChemistryTopic
    level_3_remaining: int
    total_steps: int | None = None  # how long the correct working is

class MathSessionRequest(BaseModel):
    topic: MathTopic
    problem: MathText


class MathSessionResponse(BaseModel):
    session_id: str
    topic: MathTopic
    level_3_remaining: int
    total_steps: int

# ---------------------------------------------------------------------------
# Hints, v3 ladder.
#
# HintRequest is deliberately widened here: the level-1 and level-3 prompts
# cannot diagnose a step they have not seen, and level 2 cannot mirror a
# problem's structure without reading it. That is the documented exception
# recorded in final_tasks.md, and the guarantee it costs us is replaced by
# the answer vault, the outbound redaction chokepoint, the terminal-step
# gate, and the escalation budget -- none of which are fields on this model.
# Nothing on any response model below may carry vault data.
# ---------------------------------------------------------------------------
HintText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1024)
]


class WorkedExample(BaseModel):
    """A different problem, worked in full, verified line by line.

    `verified` is set only by the verification loop in hints.py, never by a
    model and never by a caller. An example with verified=False must not be
    rendered.
    """

    problem: str
    technique: str
    steps: Annotated[list[str], Field(min_length=1, max_length=20)]
    verified: bool = False
    # One entry per step, aligned by index: the equation on that step as our
    # own parser reads it, or null where the step carries no equation.
    #
    # Additive, and it exists to end a class of bug rather than to add a
    # feature. Every step is a sentence and then the chemistry, so the client
    # was parsing prose to find the equation and putting an atom tally beside
    # it. It got that wrong often enough to be noticed. These come from
    # `judge.chemistry_equations.parse_equation`, the same parser that judges
    # the student, so a client can render the tally without doing any
    # chemistry of its own, and a step we could not parse is null rather than
    # a guess.
    equations: list[str | None] | None = None


class HintRequest(BaseModel):
    line_number: LineNumber
    error_type: ErrorType | ChemistryErrorType | None
    level: Literal[1, 2, 3]
    # Everything below is the v3 widening. All of it is optional, so the
    # existing two-field call site keeps working unchanged.
    subject: Literal["math", "chemistry"] = "math"
    topic: MathTopic | ChemistryTopic | None = None
    session_id: str | None = None
    problem: Annotated[str, StringConstraints(max_length=1024)] | None = None
    student_line: Annotated[str, StringConstraints(max_length=512)] | None = None
    previous_line: Annotated[str, StringConstraints(max_length=512)] | None = None


class HintResponse(BaseModel):
    level: int
    hint: str
    max_level: int = 3
    # Set on level 2. The prose in `hint` names the technique; this carries
    # the worked lines so the UI can render steps rather than a paragraph.
    worked_example: WorkedExample | None = None
    # True when level 3 declined because the next correct line is the answer.
    terminal_step: bool = False
    level_3_remaining: int | None = None
    # "model" when generated live, "fallback" when generation or verification
    # failed and the static floor was used. Shown, never hidden.
    source: Literal["model", "fallback"] = "fallback"
    resource: str | None = None  # a link out, used on refusal and on failure
    latency_ms: int | None = None
