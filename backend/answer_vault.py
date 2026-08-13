"""The answer vault: firewall mechanism 1.

The backend can already solve every chemistry problem it can judge. RDKit
canonicalises the target structure, the balancer computes the coefficients,
and the stoichiometry and solutions engines produce the full working. This
module does that **once, at problem setup**, and holds the result in a
server-side object.

Two rules govern this file, and both are enforced by tests:

1. It is **never imported by `schemas.py`**, and no vault ever becomes a
   field on a response model. `tests/test_answer_firewall.py` walks every
   model in `schemas.py` recursively and fails if one could carry vault data.
2. It is never serialised and never logged. `__repr__` is overridden so an
   accidental f-string in a log line cannot spill an answer.

What the vault buys, beyond redaction: it knows how long the correct working
is, which is what makes terminal-step detection (mechanism 3) a list index
rather than a guess.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sympy import Eq, solve

from judge.algebra import _parse_equation

from judge.chemistry import (
    ChemistryParseError,
    UnsupportedChemistryError,
    canonical_smiles,
    molecular_formula,
)
from judge.chemistry_equations import (
    EquationParseError,
    EquationUnbalanceableError,
    balance_coefficients,
    balanced_equation,
    coefficient_distance,
)
from judge.naming import (
    NameParseError,
    OpsinUnavailableError,
    name_to_smiles,
    structure_from_text,
)
from judge.net_ionic import net_ionic_equation
from judge.numeric import WorkedSolution, quantity_forms
from judge.quantities import values_match
from judge.redox import (
    RedoxError,
    solve_cell_potential,
    solve_oxidation_state,
)
from judge.solutions import SolutionsError, SolutionsProblem, solve_solutions
from judge.stoichiometry import (
    StoichiometryError,
    StoichiometryProblem,
    solve_stoichiometry,
)


# How close a hint's number may come to a vault number before it counts as
# stating it. Tighter than the judge's tolerance on purpose: the judge is
# deciding whether a student is right, this is deciding whether we leaked.
LEAK_TOLERANCE = 0.02


@dataclass
class AnswerVault:
    """Every form of the answer we can enumerate, held server-side only."""

    topic: str
    problem: str
    # Exact strings a hint must never contain as a standalone token.
    answer_forms: list[str] = field(default_factory=list)
    # Numeric answers, compared with tolerance rather than by string match.
    numeric_answers: list[float] = field(default_factory=list)
    # Canonical SMILES, InChIKeys, and formulas of any target structure.
    structure_forms: list[str] = field(default_factory=list)
    # The full worked solution, when the topic has one.
    solution: WorkedSolution | None = None
    # Lines of our own worked solution, and the ones within one step of it.
    near_answer_lines: list[str] = field(default_factory=list)
    # Whether every step of this problem is effectively the final one, which
    # is true for "draw this molecule": there is no step before the answer.
    single_step: bool = False
    reference_equation: str | None = None

    def __repr__(self) -> str:  # pragma: no cover - defensive
        return f"<AnswerVault topic={self.topic!r} forms={len(self.answer_forms)}>"

    __str__ = __repr__

    @property
    def total_steps(self) -> int:
        if self.single_step:
            return 1
        return len(self.solution.steps) if self.solution else 1

    def matches_number(self, value: float) -> bool:
        return any(
            values_match(answer, value, relative_floor=LEAK_TOLERANCE)
            for answer in self.numeric_answers
        )

    def matches_structure(self, smiles: str) -> bool:
        try:
            candidate = canonical_smiles(smiles)
        except (ChemistryParseError, UnsupportedChemistryError):
            return False
        return candidate in self.structure_forms

    # -- terminal-step detection, firewall mechanism 3 ----------------------

    def remaining_steps(self, student_lines: list[str]) -> int:
        """How many correct steps are still to come after this student's work.

        Zero or one means the next correct line is the answer, which is what
        makes the step terminal. This lives here rather than in the hint
        layer because only the vault knows what the full working looks like.
        """
        if self.single_step:
            return 0
        if self.solution is None or not self.solution.steps:
            return 1

        from judge.quantities import QuantityParseError, parse_quantity

        furthest = -1
        for line in student_lines:
            try:
                written = parse_quantity(line)
            except QuantityParseError:
                continue
            for index, step in enumerate(self.solution.steps):
                if values_match(
                    step.quantity.value, written.value, sig_figs=written.sig_figs
                ):
                    furthest = max(furthest, index)
        # Measured against where the answer starts, not the end of the list:
        # reaching any member of an answer group means the ladder is over.
        return self.solution.first_answer_index - furthest

    def is_terminal(self, student_lines: list[str]) -> bool:
        if self.single_step:
            return True
        if self.reference_equation is not None:
            for line in reversed(student_lines):
                try:
                    distance = coefficient_distance(line)
                except EquationParseError:
                    continue
                if distance is not None:
                    return distance <= 1
        return self.remaining_steps(student_lines) <= 1


def _add_forms(vault: AnswerVault, solution: WorkedSolution) -> None:
    vault.solution = solution
    for step in solution.answer_steps:
        vault.numeric_answers.append(step.quantity.value)
        vault.answer_forms.extend(quantity_forms(step.quantity))
    # Everything within one step of the answer is near-answer material: a
    # hint that hands over the quantity just before the answer has not
    # stated the answer, but it has come close enough to record.
    boundary = solution.first_answer_index
    for step in solution.steps[max(0, boundary - 2):boundary]:
        vault.near_answer_lines.append(f"{step.name} = {step.quantity.value:.6g}")
    if solution.formula_answer:
        vault.answer_forms.append(solution.formula_answer)
    if solution.species_answer:
        vault.answer_forms.append(solution.species_answer)


def vault_for_structure(problem: str, target_smiles: str) -> AnswerVault:
    """Drawing a specific molecule: the answer is the structure itself."""
    vault = AnswerVault(topic="structure", problem=problem, single_step=True)
    canonical = canonical_smiles(target_smiles)
    vault.structure_forms.append(canonical)
    vault.answer_forms.extend([canonical, target_smiles.strip()])
    try:
        vault.answer_forms.append(molecular_formula(target_smiles))
    except (ChemistryParseError, UnsupportedChemistryError):
        pass
    try:
        from rdkit import Chem

        molecule = Chem.MolFromSmiles(canonical)
        if molecule is not None:
            key = Chem.MolToInchiKey(molecule)
            if key:
                vault.answer_forms.append(key)
    except Exception:  # InChI support is optional in some RDKit builds
        pass
    return vault


def vault_for_formula_structure(problem: str, target_formula: str) -> AnswerVault:
    """Drawing any structure with a given formula.

    There is no single answer here on purpose: C2H6O is ethanol and it is
    also dimethyl ether, and the question asked for a structure with that
    formula rather than for one particular molecule. So the vault guards the
    formula, which is the one thing a hint must not hand over, and holds no
    structure at all. This is the "the vault would have to hold any of these"
    gap in final_tasks.md, closed by guarding the question instead of the
    set of acceptable answers.
    """
    vault = AnswerVault(topic="structure", problem=problem, single_step=True)
    formula = target_formula.strip()
    if formula:
        vault.answer_forms.append(formula)
    return vault


def vault_for_functional_group(problem: str, target_group: str) -> AnswerVault:
    """Identifying a group: the answer is the group's name."""
    vault = AnswerVault(topic="organic", problem=problem, single_step=True)
    vault.answer_forms.extend(
        [target_group, target_group.replace("_", " "), target_group.replace("_", "-")]
    )
    return vault


def vault_for_balance(problem: str, reference_equation: str) -> AnswerVault:
    """Balancing: the answer is the coefficient vector.

    The forms here are what redaction blocks, and getting them wrong in
    either direction is expensive. Bare coefficients used to be listed, and
    because a balancing answer is a vector of small integers that made "2"
    and "3" unsayable. A hint about an equation cannot avoid small integers:
    atom counts are small integers, and so are the coefficients the student
    themselves wrote. Level 1 was blocked on almost every balancing problem.

    What actually discloses the answer is a coefficient *attached to a
    species*, "3H2", not the digit 3 on its own. So those pairs are the
    forms, along with the balanced equation itself.
    """
    from judge.chemistry_equations import parse_equation

    vault = AnswerVault(
        topic="balancing", problem=problem, reference_equation=reference_equation
    )
    balanced = balanced_equation(reference_equation)
    vault.answer_forms.append(balanced)

    # Coefficient-and-species pairs, in the spellings a hint might use.
    for coefficient, formula in [*parse_equation(balanced)[0], *parse_equation(balanced)[1]]:
        if coefficient == 1:
            continue
        vault.answer_forms.append(f"{coefficient}{formula}")
        vault.answer_forms.append(f"{coefficient} {formula}")

    vault.near_answer_lines.append(balanced)
    return vault


def vault_for_net_ionic(problem: str, molecular_equation: str) -> AnswerVault:
    vault = AnswerVault(topic="balancing", problem=problem, single_step=True)
    result = net_ionic_equation(molecular_equation)
    vault.answer_forms.extend([result.net_ionic, result.complete_ionic])
    vault.near_answer_lines.append(result.net_ionic)
    return vault


def vault_for_stoichiometry(
    problem: str, stoichiometry: StoichiometryProblem
) -> AnswerVault:
    vault = AnswerVault(topic="stoichiometry", problem=problem)
    _add_forms(vault, solve_stoichiometry(stoichiometry))
    return vault


def vault_for_solutions(problem: str, solutions: SolutionsProblem) -> AnswerVault:
    vault = AnswerVault(topic="solutions", problem=problem)
    _add_forms(vault, solve_solutions(solutions))
    return vault


def vault_for_oxidation_state(problem: str, formula: str, element: str) -> AnswerVault:
    vault = AnswerVault(topic="redox", problem=problem)
    _add_forms(vault, solve_oxidation_state(formula, element))
    return vault


def vault_for_cell_potential(problem: str, cathode: str, anode: str) -> AnswerVault:
    vault = AnswerVault(topic="redox", problem=problem)
    _add_forms(vault, solve_cell_potential(cathode, anode))
    return vault

def vault_for_algebra(problem: str) -> AnswerVault:
    """Build a protected answer vault for a supported one-variable equation."""
    try:
        parsed = _parse_equation(problem)
    except Exception as exc:
        raise ValueError(f"could not parse algebra problem: {exc}") from exc

    if not isinstance(parsed, Eq):
        raise ValueError("math sessions currently require an equation")

    symbols = sorted(parsed.free_symbols, key=lambda symbol: symbol.name)
    if len(symbols) != 1:
        raise ValueError("math sessions currently support one-variable equations")

    symbol = symbols[0]
    solutions = solve(parsed, symbol)

    if len(solutions) != 1:
        raise ValueError("math sessions currently require one unique solution")

    answer = solutions[0]

    vault = AnswerVault(
        topic="algebra",
        problem=problem,
    )

    # Text forms that generated hints must never reveal.
    vault.answer_forms.extend(
        [
            str(answer),
            f"{symbol}={answer}",
            f"{symbol} = {answer}",
        ]
    )

    # Numeric leak detection catches alternate formatting such as 17.0.
    if answer.is_real and answer.is_number:
        try:
            vault.numeric_answers.append(float(answer))
        except (TypeError, ValueError):
            pass

    return vault


class VaultConstructionError(ValueError):
    """The problem could not be solved, so no vault can be built for it."""


def build_vault(
    *,
    topic: str,
    problem: str,
    target_smiles: str | None = None,
    target_group: str | None = None,
    reference_equation: str | None = None,
    molecular_equation: str | None = None,
    oxidation_formula: str | None = None,
    oxidation_element: str | None = None,
    cathode: str | None = None,
    anode: str | None = None,
    target_formula: str | None = None,
    target_name: str | None = None,
    stoichiometry: StoichiometryProblem | None = None,
    solutions: SolutionsProblem | None = None,
) -> AnswerVault:
    """Construct the vault for one problem, from whatever defines it.

    A problem we cannot solve gets no vault, and a hint request without a
    vault falls back to the static floor rather than calling a model. That
    ordering matters: no vault means no redaction reference, and generating
    freely against no reference is exactly the leak we are preventing.
    """
    try:
        if stoichiometry is not None:
            return vault_for_stoichiometry(problem, stoichiometry)
        if solutions is not None:
            return vault_for_solutions(problem, solutions)
        # Net ionic is checked first because a net ionic problem also carries
        # a molecular equation, and building a balancing vault from it would
        # guard the balanced equation rather than the net ionic one. That is
        # the "net ionic opens a balancing-shaped session" gap.
        if molecular_equation:
            return vault_for_net_ionic(problem, molecular_equation)
        if oxidation_formula and oxidation_element:
            return vault_for_oxidation_state(
                problem, oxidation_formula, oxidation_element
            )
        if cathode and anode:
            return vault_for_cell_potential(problem, cathode, anode)
        if target_smiles:
            return vault_for_structure(problem, structure_from_text(target_smiles))
        # "Draw propan-2-ol". The name is the question, and the structure it
        # resolves to is the answer, so this is a structure vault like any
        # other once OPSIN has read it. Without this the drawing types opened
        # no session at all, and no session means no vault, which means the
        # hint ladder served the static floor however good the model was.
        if target_name:
            return vault_for_structure(problem, name_to_smiles(target_name))
        if target_group:
            return vault_for_functional_group(problem, target_group)
        if target_formula:
            return vault_for_formula_structure(problem, target_formula)
        if reference_equation:
            return vault_for_balance(problem, reference_equation)
    except (
        ChemistryParseError,
        EquationParseError,
        EquationUnbalanceableError,
        # No Java on this machine means no name resolution, which is a
        # missing session and a static hint, never a crash and never a claim
        # about the student. `NameParseError` is a ValueError already.
        OpsinUnavailableError,
        RedoxError,
        SolutionsError,
        StoichiometryError,
        UnsupportedChemistryError,
        ValueError,
    ) as exc:
        raise VaultConstructionError(str(exc)) from exc

    raise VaultConstructionError(f"no vault can be built for topic {topic!r}")


def build_math_vault(*, topic: str, problem: str) -> AnswerVault:
    """Construct a protected answer vault for a supported math problem."""
    try:
        if topic == "algebra":
            return vault_for_algebra(problem)
    except ValueError as exc:
        raise VaultConstructionError(str(exc)) from exc

    raise VaultConstructionError(
        f"no math vault can be built for topic {topic!r}"
    )


__all__ = [
    "AnswerVault",
    "LEAK_TOLERANCE",
    "VaultConstructionError",
    "build_vault",
    "vault_for_balance",
    "vault_for_cell_potential",
    "vault_for_formula_structure",
    "vault_for_functional_group",
    "vault_for_net_ionic",
    "vault_for_oxidation_state",
    "vault_for_solutions",
    "vault_for_stoichiometry",
    "vault_for_structure",
    "build_math_vault",
    "vault_for_algebra",
]
