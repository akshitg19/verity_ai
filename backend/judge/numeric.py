"""The shared shape of a solved numeric chemistry problem.

Stoichiometry, solutions, and electrochemistry all work the same way once
the chemistry is done: the backend solves the problem completely, producing
an ordered list of named quantities, and a student's written line is valid
when it states one of those quantities.

Three things fall out of solving first and comparing second, and all three
are required by `final_tasks.md`:

* The answer vault (firewall mechanism 1) is exactly this solution, held
  server-side and never placed on a response model.
* Terminal-step detection (mechanism 3) is "is the quantity this line states
  the last one", which is a list index rather than a guess.
* A generated worked example is verified by running its lines through this
  same comparison, so nothing unverified reaches a student.

A line that matches an *intermediate* quantity is valid: a student is
allowed to write their working out. A line that matches nothing is the only
thing that can flag, and a line that is not a numeric claim at all is a
`parse_error`, never a mistake the student made.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from schemas import ChemistryLineVerdict, ChemistryStep
from .quantities import (
    Quantity,
    QuantityParseError,
    format_quantity,
    parse_quantity,
    quantities_match,
)


@dataclass(frozen=True)
class SolvedStep:
    """One quantity the correct working produces, with why it is that value."""

    name: str            # "moles of HCl"
    quantity: Quantity
    technique: str       # "n = m / M", internal reasoning, not a hint
    aliases: tuple[str, ...] = ()  # labels a student might write for it


@dataclass
class WorkedSolution:
    """Every quantity the correct working produces, in order.

    The last step is the answer. Everything before it is working a student
    may legitimately write down, so matching one of those is not a mistake.
    """

    task: str
    steps: list[SolvedStep] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    # Some chemistry answers are not numbers. An empirical formula is a
    # formula and a limiting reagent is a species, so the judges for those
    # tasks compare symbols before they compare values.
    formula_answer: str | None = None
    species_answer: str | None = None
    # Indices of the steps that count as the answer. Usually just the last
    # one, but pH, pOH, [H+], and [OH-] are four statements of a single
    # fact: withholding only the one the question happened to ask for would
    # be a leak dressed as a technicality.
    answer_indices: list[int] = field(default_factory=list)
    # Of that group, the one the question actually asked for. The group
    # exists so redaction covers all four statements of the fact; this exists
    # because the answer box asked for one of them by name. Left unset for
    # every task whose answer group has a single member, where it would say
    # nothing the group does not already say.
    primary_answer_name: str | None = None

    def mark_answers(self, *names: str) -> None:
        """The first name is the one the question asked for."""
        if names and self.primary_answer_name is None:
            self.primary_answer_name = names[0]
        for index, step in enumerate(self.steps):
            if step.name in names and index not in self.answer_indices:
                self.answer_indices.append(index)

    @property
    def primary_answer(self) -> SolvedStep | None:
        for step in self.answer_steps:
            if step.name == self.primary_answer_name:
                return step
        return None

    def candidates_for(
        self, written: Quantity, *, answers_only: bool
    ) -> list[SolvedStep]:
        """Which steps this written quantity is allowed to be.

        One definition, used by the match and by the wrong-unit probe below
        it, because a probe scoped more widely than the match reports a unit
        error on a step the match was never going to consider.

        The narrow case is a bare number in the answer box on a question that
        named its quantity. Found live: 0.010 M HCl has a pH of 2.00 and a
        pOH of 12.00, both in the answer group, so a student writing the bare
        12.00 that the pH/pOH mix-up produces was matched to the pOH step and
        told they were right. That is the single worst verdict this product
        can give, and it was being given on the most common mistake in the
        topic. Labelling it reopens the family: "pOH = 12.00" is accepted,
        because then they have said which quantity they mean.
        """
        if not answers_only:
            return self.steps
        if not written.name and self.primary_answer is not None:
            return [self.primary_answer]
        return self.answer_steps

    def _answer_indices(self) -> list[int]:
        if self.answer_indices:
            return sorted(self.answer_indices)
        return [len(self.steps) - 1]

    @property
    def answer_steps(self) -> list[SolvedStep]:
        return [self.steps[index] for index in self._answer_indices()]

    @property
    def answer(self) -> SolvedStep:
        if not self.steps:
            raise ValueError("a worked solution must contain at least one step")
        return self.steps[self._answer_indices()[0]]

    @property
    def first_answer_index(self) -> int:
        """Where the working stops being working and starts being the answer."""
        return self._answer_indices()[0]

    def add(
        self,
        name: str,
        value: float,
        unit: str | None,
        dimension: str | None,
        technique: str,
        *aliases: str,
    ) -> SolvedStep:
        step = SolvedStep(
            name=name,
            quantity=Quantity(value=value, unit=unit, dimension=dimension, name=name),
            technique=technique,
            aliases=tuple(alias.lower() for alias in aliases),
        )
        self.steps.append(step)
        return step

    def match(self, written: Quantity, *, answers_only: bool = False) -> SolvedStep | None:
        """The step this written quantity states, if any.

        `answers_only` narrows the comparison to the final answer. It exists
        for the worksheet layout, where the student writes their working in a
        region we deliberately do not judge and then states one number in an
        answer box. There, an intermediate is not a legitimate middle line, it
        is the wrong answer, and accepting it would be the confident-valid
        failure this file's own comment warns about two paragraphs down.

        An unrecognised label never rejects. A student who writes "n = 0.125"
        when 0.125 is the molarity has still written a number the working
        produces, and calling that a mistake would be exactly the
        confident-wrong verdict this product must never give. So a label the
        solution does not know falls through to matching on value alone.

        A label the solution *does* know is different, and this used to fall
        through too. On a pH problem the answer group holds pH, pOH, [H+] and
        [OH-], so a student writing "pH = 12.00" when the pH is 2.00 matched
        the pOH step, which is 12.00, and was told they were right. That is
        the fatal failure in this file's own taxonomy: a confident valid on a
        wrong line. Naming a quantity we computed and giving it a different
        value is now a mismatch, full stop.
        """
        candidates = self.candidates_for(written, answers_only=answers_only)
        labelled = [
            step
            for step in candidates
            if written.name
            and (written.name == step.name.lower() or written.name in step.aliases)
        ]
        for step in labelled or candidates:
            if quantities_match(step.quantity, written):
                return step
        return None

    def is_terminal(self, step: SolvedStep) -> bool:
        return step in self.answer_steps

    def answer_forms(self) -> list[str]:
        """Every rendering of the answer, for the redaction filter."""
        forms: list[str] = []
        for step in self.answer_steps:
            forms.extend(quantity_forms(step.quantity))
        return forms


def quantity_forms(quantity: Quantity) -> list[str]:
    """Textual forms of one quantity a hint must never state."""
    value = quantity.value
    forms = {
        format_quantity(quantity),
        f"{value:.6g}",
        f"{value:.4g}",
        f"{value:.3g}",
        f"{value:.2g}",
    }
    if quantity.unit:
        for digits in (2, 3, 4):
            forms.add(f"{value:.{digits}g} {quantity.unit}")
            forms.add(f"{value:.{digits}g}{quantity.unit}")
    if float(value).is_integer():
        forms.add(str(int(value)))
    return sorted(form for form in forms if form)


def judge_quantity_steps(
    solution: WorkedSolution,
    steps: list[ChemistryStep],
    *,
    text_of=lambda step: step.smiles,
    answers_only: bool = False,
) -> list[ChemistryLineVerdict]:
    """Compare each written line against the solved quantities.

    With `answers_only`, only the final answer counts as a match. A line that
    states an intermediate is told *which* mistake it made, because "you
    stopped one step early" and "that number appears nowhere in this problem"
    are different problems and deserve different hints.
    """
    verdicts: list[ChemistryLineVerdict] = []
    for step in steps:
        raw = text_of(step)
        try:
            written = parse_quantity(raw)
        except QuantityParseError as exc:
            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=False,
                    error_type="parse_error",
                    detail=str(exc),
                    judged_by="deterministic",
                )
            )
            continue

        matched = solution.match(written, answers_only=answers_only)
        if matched is not None:
            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=True,
                    detail=f"Matches {matched.name}",
                    judged_by="deterministic",
                )
            )
            continue

        # Right number, wrong dimension is a different mistake from a wrong
        # number, and a student deserves to be told which one it was. Scoped
        # to the same steps the match was: otherwise an intermediate written
        # with the correct unit is reported as a unit error, because some
        # other step happens to share its value.
        wrong_unit = any(
            quantities_match(
                Quantity(
                    value=candidate.quantity.value,
                    unit=written.unit,
                    dimension=written.dimension,
                ),
                written,
            )
            for candidate in solution.candidates_for(
                written, answers_only=answers_only
            )
        )
        # An intermediate written in the answer box is a stop-too-early, not a
        # number out of nowhere, and saying so is the whole value of knowing
        # which line is the answer.
        stopped_early = (
            answers_only and solution.match(written, answers_only=False) is not None
        )
        # Checked before the unit, because it is the better description of
        # the same line: a bare 0.010 in the answer box of a pH question is
        # not a unit slip, it is the concentration they started from.
        if stopped_early:
            detail = "That is a quantity from the working, not the final answer"
        elif wrong_unit:
            detail = "Value matches a quantity in the working but the unit does not"
        else:
            detail = "No quantity in the correct working has this value"
        verdicts.append(
            ChemistryLineVerdict(
                line_number=step.line_number,
                valid=False,
                error_type=(
                    "wrong_unit" if wrong_unit and not stopped_early else "wrong_value"
                ),
                detail=detail,
                judged_by="deterministic",
            )
        )
    return verdicts


__all__ = [
    "SolvedStep",
    "WorkedSolution",
    "judge_quantity_steps",
    "quantity_forms",
]
