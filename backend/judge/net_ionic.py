"""Net ionic equations and spectator ions: the extension to subject 2.

`final_tasks.md` describes this as "the same parser plus a solubility
table", and that is exactly what it is. `chemistry_equations.py` supplies
the formula parser and the balancer; this adds an ion table, the standard
solubility rules, and the cancellation.

The rules are the ones a first-year course teaches, in the order it teaches
them, and a compound this cannot split into a known cation and anion is
treated as molecular rather than guessed at. Guessing would put an invented
ion on both sides of a student's equation and cancel the wrong thing.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import gcd

from schemas import BalanceLineVerdict, ChemistryEquationStep
from .base import Judge
from .chemistry_equations import (
    EquationParseError,
    EquationUnbalanceableError,
    balance_coefficients,
    parse_equation,
    parse_formula,
)


# Charge of each ion we recognise. Polyatomic ions are matched by their atom
# counts, not their written form, so (NH4)2SO4 and N2H8SO4 split identically.
CATIONS: dict[str, int] = {
    "Li": 1, "Na": 1, "K": 1, "Rb": 1, "Cs": 1, "NH4": 1, "Ag": 1, "H": 1,
    "Mg": 2, "Ca": 2, "Sr": 2, "Ba": 2, "Zn": 2, "Cu": 2, "Fe": 2, "Ni": 2,
    "Co": 2, "Mn": 2, "Pb": 2, "Sn": 2, "Cd": 2, "Hg": 2,
    "Al": 3, "Cr": 3, "Bi": 3,
}
ANIONS: dict[str, int] = {
    "F": -1, "Cl": -1, "Br": -1, "I": -1, "OH": -1, "NO3": -1, "NO2": -1,
    "ClO4": -1, "ClO3": -1, "ClO2": -1, "ClO": -1, "MnO4": -1, "HCO3": -1,
    "HSO4": -1, "H2PO4": -1, "CN": -1, "SCN": -1, "C2H3O2": -1, "CHO2": -1,
    "O": -2, "S": -2, "SO4": -2, "SO3": -2, "CO3": -2, "CrO4": -2,
    "Cr2O7": -2, "C2O4": -2, "HPO4": -2, "S2O3": -2,
    "N": -3, "P": -3, "PO4": -3, "PO3": -3,
}

# Cations whose salts are soluble with essentially every anion.
ALWAYS_SOLUBLE_CATIONS = frozenset({"Li", "Na", "K", "Rb", "Cs", "NH4"})
# Anions whose salts are soluble with essentially every cation.
ALWAYS_SOLUBLE_ANIONS = frozenset(
    {"NO3", "NO2", "ClO4", "ClO3", "C2H3O2", "CHO2", "HCO3"}
)
HALIDE_EXCEPTIONS = frozenset({"Ag", "Pb", "Hg"})
SULFATE_EXCEPTIONS = frozenset({"Ba", "Pb", "Sr", "Ca", "Ag", "Hg"})
# Anions that are insoluble unless the cation is on the always-soluble list.
INSOLUBLE_ANIONS = frozenset(
    {"CO3", "PO4", "PO3", "S", "SO3", "CrO4", "C2O4", "HPO4", "O", "N", "P"}
)
HYDROXIDE_EXCEPTIONS = frozenset({"Ca", "Sr", "Ba"})

STRONG_ACIDS = frozenset({"HCl", "HBr", "HI", "HNO3", "H2SO4", "HClO4", "HClO3"})
STRONG_BASE_CATIONS = ALWAYS_SOLUBLE_CATIONS | HYDROXIDE_EXCEPTIONS
# Species that are molecular no matter what the ion tables would suggest.
MOLECULAR_SPECIES = frozenset(
    {"H2O", "CO2", "SO2", "NH3", "H2", "O2", "N2", "Cl2", "Br2", "I2", "CH4"}
)


class NetIonicError(ValueError):
    """This equation cannot be reduced to a net ionic equation."""


def _atoms_of(formula: str) -> dict[str, int]:
    atoms, _ = parse_formula(formula)
    return atoms


_CATION_ATOMS = {name: _atoms_of(name) for name in CATIONS}
_ANION_ATOMS = {name: _atoms_of(name) for name in ANIONS}


@dataclass(frozen=True)
class Ion:
    formula: str
    charge: int

    def written(self) -> str:
        if self.charge == 0:
            return self.formula
        magnitude = abs(self.charge)
        sign = "+" if self.charge > 0 else "-"
        return f"{self.formula}^{magnitude if magnitude > 1 else ''}{sign}"


def split_into_ions(formula: str) -> tuple[Ion, int, Ion, int] | None:
    """Split a neutral salt into (cation, count, anion, count).

    Matching is by atom tally rather than by string shape, so Ca(NO3)2,
    CaN2O6, and Ca(NO3)2(aq) all resolve to the same pair. Returns None when
    no known pair reproduces the formula exactly, which is the signal to
    treat the species as molecular.
    """
    atoms, charge = parse_formula(formula)
    if charge or not atoms:
        return None
    if formula in MOLECULAR_SPECIES:
        return None

    for cation, cation_charge in CATIONS.items():
        cation_atoms = _CATION_ATOMS[cation]
        if not set(cation_atoms) <= set(atoms):
            continue
        for anion, anion_charge in ANIONS.items():
            anion_atoms = _ANION_ATOMS[anion]
            magnitude = abs(anion_charge)
            divisor = gcd(cation_charge, magnitude)
            cation_count = magnitude // divisor
            anion_count = cation_charge // divisor

            expected: dict[str, int] = {}
            for symbol, count in cation_atoms.items():
                expected[symbol] = expected.get(symbol, 0) + count * cation_count
            for symbol, count in anion_atoms.items():
                expected[symbol] = expected.get(symbol, 0) + count * anion_count
            if expected == atoms:
                return (
                    Ion(cation, cation_charge),
                    cation_count,
                    Ion(anion, anion_charge),
                    anion_count,
                )
    return None


def is_soluble(formula: str) -> bool:
    """Apply the standard solubility rules in their usual priority order."""
    split = split_into_ions(formula)
    if split is None:
        return False
    cation, _, anion, _ = split

    if cation.formula in ALWAYS_SOLUBLE_CATIONS:
        return True
    if anion.formula in ALWAYS_SOLUBLE_ANIONS:
        return True
    if anion.formula in {"Cl", "Br", "I"}:
        return cation.formula not in HALIDE_EXCEPTIONS
    if anion.formula == "SO4":
        return cation.formula not in SULFATE_EXCEPTIONS
    if anion.formula == "OH":
        return cation.formula in HYDROXIDE_EXCEPTIONS
    if anion.formula in INSOLUBLE_ANIONS:
        return False
    return True


def dissociates(formula: str) -> bool:
    """Whether this species exists as free ions in solution."""
    if formula in MOLECULAR_SPECIES:
        return False
    if formula in STRONG_ACIDS:
        return True
    split = split_into_ions(formula)
    if split is None:
        return False
    cation, _, anion, _ = split
    if anion.formula == "OH":
        return cation.formula in STRONG_BASE_CATIONS
    return is_soluble(formula)


def _ionise(formula: str, coefficient: int) -> list[tuple[int, str]]:
    """One species as the terms it contributes to the complete ionic equation."""
    if not dissociates(formula):
        return [(coefficient, formula)]
    split = split_into_ions(formula)
    if split is None:
        return [(coefficient, formula)]
    cation, cation_count, anion, anion_count = split
    return [
        (coefficient * cation_count, cation.written()),
        (coefficient * anion_count, anion.written()),
    ]


def _tally_terms(terms: list[tuple[int, str]]) -> dict[str, int]:
    tally: dict[str, int] = {}
    for coefficient, formula in terms:
        tally[formula] = tally.get(formula, 0) + coefficient
    return tally


@dataclass
class NetIonicResult:
    complete_ionic: str
    net_ionic: str
    spectator_ions: list[str]
    left: dict[str, int]
    right: dict[str, int]
    no_reaction: bool = False


def _format_side(tally: dict[str, int]) -> str:
    return " + ".join(
        (formula if count == 1 else f"{count}{formula}")
        for formula, count in tally.items()
    )


def net_ionic_equation(molecular_equation: str) -> NetIonicResult:
    """Reduce a molecular equation to its net ionic form.

    >>> net_ionic_equation("AgNO3 + NaCl -> AgCl + NaNO3").net_ionic
    'Ag^+ + Cl^- -> AgCl'
    """
    left, right = parse_equation(molecular_equation)
    left_coefficients, right_coefficients = balance_coefficients(molecular_equation)

    left_terms: list[tuple[int, str]] = []
    for coefficient, (_, formula) in zip(left_coefficients, left):
        left_terms.extend(_ionise(formula, coefficient))
    right_terms: list[tuple[int, str]] = []
    for coefficient, (_, formula) in zip(right_coefficients, right):
        right_terms.extend(_ionise(formula, coefficient))

    left_tally = _tally_terms(left_terms)
    right_tally = _tally_terms(right_terms)
    complete_ionic = f"{_format_side(left_tally)} -> {_format_side(right_tally)}"

    spectators: list[str] = []
    net_left = dict(left_tally)
    net_right = dict(right_tally)
    for formula in sorted(set(left_tally) & set(right_tally)):
        cancelled = min(left_tally[formula], right_tally[formula])
        net_left[formula] -= cancelled
        net_right[formula] -= cancelled
        # Only a fully cancelled ion is a spectator. A species that is
        # partly consumed is taking part in the reaction and must stay.
        if net_left[formula] == 0 and net_right[formula] == 0:
            spectators.append(formula)
    net_left = {f: c for f, c in net_left.items() if c}
    net_right = {f: c for f, c in net_right.items() if c}

    if not net_left and not net_right:
        return NetIonicResult(
            complete_ionic=complete_ionic,
            net_ionic="no reaction",
            spectator_ions=spectators,
            left={},
            right={},
            no_reaction=True,
        )

    divisor = 0
    for count in list(net_left.values()) + list(net_right.values()):
        divisor = gcd(divisor, count)
    if divisor > 1:
        net_left = {f: c // divisor for f, c in net_left.items()}
        net_right = {f: c // divisor for f, c in net_right.items()}

    return NetIonicResult(
        complete_ionic=complete_ionic,
        net_ionic=f"{_format_side(net_left)} -> {_format_side(net_right)}",
        spectator_ions=spectators,
        left=net_left,
        right=net_right,
    )


class NetIonicJudge(Judge[str, ChemistryEquationStep, BalanceLineVerdict]):
    """Checks a written net ionic equation against the computed one.

    Comparison is by species tally, so term order and spacing do not matter,
    and a student who has written the *complete* ionic equation is told that
    specifically rather than being told they are simply wrong.
    """

    def check(
        self,
        molecular_equation: str,
        steps: list[ChemistryEquationStep],
    ) -> list[BalanceLineVerdict]:
        try:
            result = net_ionic_equation(molecular_equation)
        except EquationUnbalanceableError as exc:
            return [
                BalanceLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported problem: {exc}",
                    judged_by="deterministic",
                )
            ]
        except (EquationParseError, NetIonicError) as exc:
            return [
                BalanceLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse the molecular equation: {exc}",
                    judged_by="deterministic",
                )
            ]

        complete = net_ionic_equation(molecular_equation).complete_ionic

        verdicts: list[BalanceLineVerdict] = []
        for step in steps:
            try:
                written_left, written_right = parse_equation(step.equation)
            except EquationParseError as exc:
                verdicts.append(
                    BalanceLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=str(exc),
                        judged_by="deterministic",
                    )
                )
                continue

            left_tally = _normalise_written(written_left)
            right_tally = _normalise_written(written_right)
            expected_left = _normalise_formulas(result.left)
            expected_right = _normalise_formulas(result.right)

            if left_tally == expected_left and right_tally == expected_right:
                verdicts.append(
                    BalanceLineVerdict(
                        line_number=step.line_number,
                        valid=True,
                        detail="Matches the net ionic equation",
                        judged_by="deterministic",
                    )
                )
                continue

            complete_left, _, complete_right = complete.partition(" -> ")
            wrote_complete = (
                left_tally == _normalise_written(parse_equation(complete)[0])
                and right_tally == _normalise_written(parse_equation(complete)[1])
            )
            verdicts.append(
                BalanceLineVerdict(
                    line_number=step.line_number,
                    valid=False,
                    error_type="not_net_ionic" if wrote_complete else "wrong_species",
                    detail=(
                        "This is the complete ionic equation; the spectator ions "
                        "still have to be cancelled"
                        if wrote_complete
                        else "The species on this line are not the ones that react"
                    ),
                    judged_by="deterministic",
                )
            )
            del complete_left, complete_right
        return verdicts


def _species_key(formula: str) -> tuple:
    atoms, charge = parse_formula(formula)
    return tuple(sorted(atoms.items())), charge


def _normalise_written(terms: list[tuple[int, str]]) -> dict[tuple, int]:
    tally: dict[tuple, int] = {}
    for coefficient, formula in terms:
        key = _species_key(formula)
        tally[key] = tally.get(key, 0) + coefficient
    return tally


def _normalise_formulas(tally: dict[str, int]) -> dict[tuple, int]:
    normalised: dict[tuple, int] = {}
    for formula, count in tally.items():
        key = _species_key(formula)
        normalised[key] = normalised.get(key, 0) + count
    return normalised


__all__ = [
    "Ion",
    "NetIonicError",
    "NetIonicJudge",
    "NetIonicResult",
    "dissociates",
    "is_soluble",
    "net_ionic_equation",
    "split_into_ions",
]
