"""Redox and electrochemistry: chemistry subject 3.

Half-reaction atom and charge balancing already lives in
`chemistry_equations.py`. This module adds the two pieces `final_tasks.md`
asks for on top of it:

* **Oxidation-state assignment**, which is a rule set rather than a lookup,
  and is therefore fully deterministic. The rules are applied in priority
  order and the unknown element is solved for, so "what is the oxidation
  state of Cr in Cr2O7^2-" is arithmetic, not chemistry intuition.
* **Standard cell potentials**, which are a table lookup plus one
  subtraction.

The honest limit is written into the code rather than papered over: a
formula with two unknown elements has no unique answer from the rules
alone, and this returns `unsupported` rather than guessing. Guessing here
would produce a confident wrong verdict, which is the failure mode the
product cannot have.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from fractions import Fraction

from schemas import ChemistryLineVerdict, ChemistryStep
from .base import Judge
from .chemistry_equations import (
    EquationParseError,
    parse_equation,
    parse_formula,
)
from .numeric import WorkedSolution, judge_quantity_steps
from .quantities import QuantityParseError, parse_quantity, values_match


ALKALI_METALS = frozenset({"Li", "Na", "K", "Rb", "Cs", "Fr"})
ALKALINE_EARTH = frozenset({"Be", "Mg", "Ca", "Sr", "Ba", "Ra"})
HALOGENS = frozenset({"F", "Cl", "Br", "I", "At"})
# Metals whose binary hydrides put hydrogen at -1 rather than +1.
HYDRIDE_METALS = ALKALI_METALS | ALKALINE_EARTH
# "+6", "6+", "6", and "-2" are one claim written four ways.
_STATE_RE = re.compile(r"^([+-]?)(\d+(?:\.\d+)?)([+-]?)$")
_ROMAN_RE = re.compile(r"^([+-]?)([ivxIVX]+|0)([+-]?)$")
# Peroxides and superoxides are the standard exception to oxygen at -2, and
# they cannot be told from a formula alone, so they are named explicitly.
PEROXIDES = frozenset({"H2O2", "Na2O2", "K2O2", "BaO2", "Li2O2", "CaO2", "MgO2"})
SUPEROXIDES = frozenset({"KO2", "RbO2", "CsO2", "NaO2"})


class RedoxError(ValueError):
    """The oxidation state cannot be determined from the rules alone."""


def _known_state(
    symbol: str,
    atoms: dict[str, int],
    formula: str,
    unknown: str,
) -> Fraction | None:
    """The oxidation state a rule fixes for this element, if any."""
    if symbol == unknown:
        return None
    if len(atoms) == 1:
        return Fraction(0)  # a free element, whatever its subscript
    if symbol == "F":
        return Fraction(-1)
    if symbol in ALKALI_METALS:
        return Fraction(1)
    if symbol in ALKALINE_EARTH:
        return Fraction(2)
    if symbol == "H":
        metals = [element for element in atoms if element in HYDRIDE_METALS]
        return Fraction(-1) if metals and len(atoms) == 2 else Fraction(1)
    if symbol == "O":
        if formula in SUPEROXIDES:
            return Fraction(-1, 2)
        if formula in PEROXIDES:
            return Fraction(-1)
        if "F" in atoms:
            return Fraction(2)
        return Fraction(-2)
    if symbol in HALOGENS:
        # A halogen is -1 unless a more electronegative partner outranks it.
        more_electronegative = {"O", "F"} & set(atoms)
        if more_electronegative and symbol != "F":
            return None
        return Fraction(-1)
    return None


def oxidation_state(formula: str, element: str) -> Fraction:
    """The oxidation state of one element in one formula.

    >>> oxidation_state("Cr2O7^2-", "Cr")
    Fraction(6, 1)
    >>> oxidation_state("H2O", "O")
    Fraction(-2, 1)
    """
    atoms, charge = parse_formula(formula)
    if not atoms:
        raise RedoxError(f"{formula!r} contains no atoms")
    if element not in atoms:
        raise RedoxError(f"{element} does not appear in {formula}")

    if len(atoms) == 1 and charge == 0:
        return Fraction(0)
    if len(atoms) == 1 and sum(atoms.values()) == 1:
        return Fraction(charge)

    total = Fraction(0)
    unresolved: list[str] = []
    for symbol, count in atoms.items():
        state = _known_state(symbol, atoms, formula, element)
        if state is None:
            if symbol != element:
                unresolved.append(symbol)
            continue
        total += state * count

    if unresolved:
        raise RedoxError(
            "the rules do not fix an oxidation state for "
            + ", ".join(sorted(unresolved))
            + f" in {formula}, so {element} has no unique answer"
        )

    remaining = Fraction(charge) - total
    return remaining / atoms[element]


def solve_oxidation_state(formula: str, element: str) -> WorkedSolution:
    """Every state the rules fix, then the one they leave for the student."""
    atoms, charge = parse_formula(formula)
    solution = WorkedSolution(task="oxidation_state")

    for symbol in sorted(atoms):
        if symbol == element:
            continue
        state = _known_state(symbol, atoms, formula, element)
        if state is not None:
            solution.add(
                f"oxidation state of {symbol}",
                float(state),
                None,
                None,
                "fixed by the standard rules",
                symbol.lower(),
            )
    solution.add(
        "total charge",
        float(charge),
        None,
        None,
        "the oxidation states must sum to the overall charge",
    )
    answer = oxidation_state(formula, element)
    solution.add(
        f"oxidation state of {element}",
        float(answer),
        None,
        None,
        "solved from the sum",
        element.lower(),
        "x",
    )
    solution.notes.append(f"{element} is {answer} in {formula}")
    return solution


# ---------------------------------------------------------------------------
# Standard reduction potentials, 25 C, aqueous, versus the standard hydrogen
# electrode. A teaching table rather than an exhaustive one: everything here
# appears in a first-year course, and a half-reaction that is not in the
# table returns `unsupported` rather than a made-up number.
# ---------------------------------------------------------------------------
STANDARD_REDUCTION_POTENTIALS: dict[str, float] = {
    "F2 + 2e- -> 2F^-": 2.87,
    "H2O2 + 2H^+ + 2e- -> 2H2O": 1.78,
    "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O": 1.51,
    "Au^3+ + 3e- -> Au": 1.50,
    "Cl2 + 2e- -> 2Cl^-": 1.36,
    "Cr2O7^2- + 14H^+ + 6e- -> 2Cr^3+ + 7H2O": 1.33,
    "O2 + 4H^+ + 4e- -> 2H2O": 1.23,
    "Br2 + 2e- -> 2Br^-": 1.07,
    "NO3^- + 4H^+ + 3e- -> NO + 2H2O": 0.96,
    "Ag^+ + e- -> Ag": 0.80,
    "Fe^3+ + e- -> Fe^2+": 0.77,
    "I2 + 2e- -> 2I^-": 0.54,
    "Cu^+ + e- -> Cu": 0.52,
    "Cu^2+ + 2e- -> Cu": 0.34,
    "Cu^2+ + e- -> Cu^+": 0.16,
    "Sn^4+ + 2e- -> Sn^2+": 0.15,
    "2H^+ + 2e- -> H2": 0.00,
    "Pb^2+ + 2e- -> Pb": -0.13,
    "Sn^2+ + 2e- -> Sn": -0.14,
    "Ni^2+ + 2e- -> Ni": -0.25,
    "Co^2+ + 2e- -> Co": -0.28,
    "Cd^2+ + 2e- -> Cd": -0.40,
    "Fe^2+ + 2e- -> Fe": -0.44,
    "Cr^3+ + 3e- -> Cr": -0.74,
    "Zn^2+ + 2e- -> Zn": -0.76,
    "2H2O + 2e- -> H2 + 2OH^-": -0.83,
    "Mn^2+ + 2e- -> Mn": -1.18,
    "Al^3+ + 3e- -> Al": -1.66,
    "Mg^2+ + 2e- -> Mg": -2.37,
    "Na^+ + e- -> Na": -2.71,
    "Ca^2+ + 2e- -> Ca": -2.87,
    "Ba^2+ + 2e- -> Ba": -2.91,
    "K^+ + e- -> K": -2.93,
    "Li^+ + e- -> Li": -3.05,
}


def _canonical_half_reaction(equation: str) -> tuple[frozenset, frozenset]:
    """A comparison key that ignores how the half-reaction was written."""
    left, right = parse_equation(equation)

    def side(terms):
        tally: dict[tuple, int] = {}
        for coefficient, formula in terms:
            atoms, charge = parse_formula(formula)
            key = (tuple(sorted(atoms.items())), charge)
            tally[key] = tally.get(key, 0) + coefficient
        return frozenset(tally.items())

    return side(left), side(right)


_POTENTIAL_INDEX = {
    _canonical_half_reaction(equation): (equation, potential)
    for equation, potential in STANDARD_REDUCTION_POTENTIALS.items()
}


def reduction_potential(half_reaction: str) -> tuple[float, bool]:
    """Look up a half-reaction. Returns (E in volts, was_reversed).

    A student may write the anode as the oxidation it actually is, so a
    half-reaction found only in reverse is accepted and its sign flipped,
    with the fact recorded rather than silently absorbed.
    """
    key = _canonical_half_reaction(half_reaction)
    if key in _POTENTIAL_INDEX:
        return _POTENTIAL_INDEX[key][1], False
    reversed_key = (key[1], key[0])
    if reversed_key in _POTENTIAL_INDEX:
        return _POTENTIAL_INDEX[reversed_key][1], True
    raise RedoxError(
        "this half-reaction is not in the standard reduction potential table"
    )


def solve_cell_potential(cathode: str, anode: str) -> WorkedSolution:
    """E_cell = E_cathode - E_anode, both as reduction potentials."""
    solution = WorkedSolution(task="cell_potential")

    cathode_potential, _ = reduction_potential(cathode)
    anode_potential, anode_reversed = reduction_potential(anode)
    if anode_reversed:
        solution.notes.append(
            "the anode was written as an oxidation; its reduction potential is "
            f"{anode_potential:+.2f} V"
        )

    solution.add(
        "cathode reduction potential",
        cathode_potential,
        "V",
        "potential",
        "standard table value",
        "e cathode",
        "ecathode",
    )
    solution.add(
        "anode reduction potential",
        anode_potential,
        "V",
        "potential",
        "standard table value",
        "e anode",
        "eanode",
    )
    solution.add(
        "standard cell potential",
        cathode_potential - anode_potential,
        "V",
        "potential",
        "E_cell = E_cathode - E_anode",
        "e",
        "ecell",
        "e cell",
    )
    solution.notes.append(
        "spontaneous" if cathode_potential > anode_potential else "not spontaneous"
    )
    return solution


@dataclass(frozen=True)
class OxidationStateProblem:
    formula: str
    element: str


@dataclass(frozen=True)
class CellPotentialProblem:
    cathode: str
    anode: str


class OxidationStateJudge(
    Judge[OxidationStateProblem, ChemistryStep, ChemistryLineVerdict]
):
    """Checks a written oxidation state, in any of the ways it gets written.

    "+6", "6+", "VI", and "6" are all the same claim, and a judge that only
    accepts one of them is measuring notation rather than chemistry.
    """

    ROMAN = {
        "0": 0, "i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6,
        "vii": 7, "viii": 8,
    }

    def check(
        self,
        problem: OxidationStateProblem,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        try:
            solution = solve_oxidation_state(problem.formula, problem.element)
            answer = float(oxidation_state(problem.formula, problem.element))
        except RedoxError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported problem: {exc}",
                    judged_by="deterministic",
                )
            ]
        except EquationParseError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse the formula: {exc}",
                    judged_by="deterministic",
                )
            ]

        verdicts: list[ChemistryLineVerdict] = []
        for step in steps:
            # A labelled line names which quantity it claims, so the solved
            # working decides it: "H = +1" on the way to sulfur's state is
            # working, not a wrong answer for sulfur.
            if "=" in step.smiles:
                labelled = judge_quantity_steps(solution, [step])
                if labelled and labelled[0].status == "valid":
                    verdicts.extend(labelled)
                    continue

            written = self._read_state(step.smiles)
            if written is None:
                # Not a bare state -- fall back to the quantity comparison so
                # a student writing intermediate arithmetic is still judged.
                verdicts.extend(judge_quantity_steps(solution, [step]))
                continue
            correct = values_match(answer, written, sig_figs=3)
            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=correct,
                    error_type=None if correct else "wrong_oxidation_state",
                    detail=(
                        None
                        if correct
                        else "This is not the oxidation state the rules give"
                    ),
                    judged_by="deterministic",
                )
            )
        return verdicts

    def _read_state(self, text: str) -> float | None:
        """Read "+6", "6+", "6", "VI", and "(VI)" as the same claim.

        Handwriting puts the sign on either side and chemistry textbooks use
        Roman numerals, so a judge that accepts only one spelling is
        measuring notation rather than chemistry.
        """
        body = text.strip()
        if "=" in body:
            body = body.split("=")[-1].strip()
        body = body.strip("()[] ").replace(" ", "")
        if not body:
            return None

        match = _STATE_RE.match(body)
        if match:
            leading, digits, trailing = match.groups()
            sign = -1.0 if "-" in (leading, trailing) else 1.0
            return sign * float(digits)

        roman = _ROMAN_RE.match(body)
        if roman:
            leading, numeral, trailing = roman.groups()
            sign = -1.0 if "-" in (leading, trailing) else 1.0
            return sign * self.ROMAN[numeral.lower()]

        try:
            quantity = parse_quantity(body)
        except QuantityParseError:
            return None
        if quantity.unit:
            return None
        return quantity.value


class CellPotentialJudge(
    Judge[CellPotentialProblem, ChemistryStep, ChemistryLineVerdict]
):
    """Checks a written cell potential against the table arithmetic."""

    def check(
        self,
        problem: CellPotentialProblem,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        try:
            solution = solve_cell_potential(problem.cathode, problem.anode)
        except RedoxError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported problem: {exc}",
                    judged_by="deterministic",
                )
            ]
        except EquationParseError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse a half-reaction: {exc}",
                    judged_by="deterministic",
                )
            ]
        return judge_quantity_steps(solution, steps)


__all__ = [
    "STANDARD_REDUCTION_POTENTIALS",
    "CellPotentialJudge",
    "CellPotentialProblem",
    "OxidationStateJudge",
    "OxidationStateProblem",
    "RedoxError",
    "oxidation_state",
    "reduction_potential",
    "solve_cell_potential",
    "solve_oxidation_state",
]
