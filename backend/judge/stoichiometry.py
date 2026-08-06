"""Formulas, moles, and stoichiometry: chemistry subject 1.

Built on the formula parser already in `chemistry_equations.py` plus atomic
weights from RDKit's periodic table. `final_tasks.md` proposed adding the
`periodictable` package for the weights; RDKit is already a hard dependency
and ships the same data, so this uses that instead and the dependency list
does not grow. If the weights ever need to move, `atomic_weight` is the one
function to change.

Every task solves the problem completely and returns a `WorkedSolution`, so
the judge compares rather than derives, and the answer vault gets the full
set of correct quantities for free.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from rdkit import Chem

from schemas import ChemistryLineVerdict, ChemistryStep
from .base import Judge
from .chemistry_equations import (
    EquationParseError,
    EquationUnbalanceableError,
    balance_coefficients,
    parse_equation,
    parse_formula,
)
from .numeric import WorkedSolution, judge_quantity_steps
from .quantities import QuantityParseError, parse_quantity


AVOGADRO = 6.02214076e23
MAX_ELEMENTS_IN_COMPOSITION = 12

TASKS = (
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
)

_PERIODIC_TABLE = Chem.GetPeriodicTable()


class StoichiometryError(ValueError):
    """The problem as stated cannot be solved as written."""


def atomic_weight(symbol: str) -> float:
    try:
        weight = _PERIODIC_TABLE.GetAtomicWeight(symbol)
    except Exception as exc:  # RDKit raises a bare RuntimeError here
        raise StoichiometryError(f"unknown element {symbol!r}") from exc
    if not weight:
        raise StoichiometryError(f"no atomic weight for {symbol!r}")
    return float(weight)


def molar_mass(formula: str) -> float:
    """Grams per mole of one formula.

    >>> round(molar_mass("H2O"), 3)
    18.015
    """
    atoms, _ = parse_formula(formula)
    if not atoms:
        raise StoichiometryError(f"{formula!r} contains no atoms")
    return sum(atomic_weight(symbol) * count for symbol, count in atoms.items())


def percent_composition(formula: str) -> dict[str, float]:
    """Mass percent of every element in a formula."""
    atoms, _ = parse_formula(formula)
    total = molar_mass(formula)
    return {
        symbol: 100.0 * atomic_weight(symbol) * count / total
        for symbol, count in atoms.items()
    }


def _format_formula(counts: dict[str, int]) -> str:
    """Hill order: carbon, then hydrogen, then everything alphabetically."""
    ordered: list[str] = []
    if "C" in counts:
        ordered.append("C")
        if "H" in counts:
            ordered.append("H")
    ordered.extend(
        sorted(symbol for symbol in counts if symbol not in ordered)
    )
    return "".join(
        symbol if counts[symbol] == 1 else f"{symbol}{counts[symbol]}"
        for symbol in ordered
        if counts[symbol]
    )


def _whole_number_ratio(values: dict[str, float]) -> dict[str, int]:
    """Scale mole ratios up to the smallest whole numbers that fit them.

    Dividing by the smallest value leaves ratios like 1 : 1.5, which is why
    this then tries multipliers rather than rounding: rounding 1.5 to 2 is
    the classic wrong empirical formula, and it must not be reachable here.
    """
    smallest = min(values.values())
    if smallest <= 0:
        raise StoichiometryError("every amount must be positive")
    ratios = {symbol: value / smallest for symbol, value in values.items()}

    for multiplier in range(1, 13):
        scaled = {
            symbol: ratio * multiplier for symbol, ratio in ratios.items()
        }
        if all(
            abs(value - round(value)) <= 0.06 * max(1.0, round(value))
            for value in scaled.values()
        ):
            rounded = {symbol: int(round(value)) for symbol, value in scaled.items()}
            if all(count >= 1 for count in rounded.values()):
                return rounded

    raise StoichiometryError(
        "these amounts do not reduce to a whole-number formula"
    )


@dataclass(frozen=True)
class StoichiometryProblem:
    """One stoichiometry question, in the terms the solver needs."""

    task: str
    formula: str | None = None
    element: str | None = None
    mass_g: float | None = None
    moles: float | None = None
    particles: float | None = None
    equation: str | None = None
    # formula -> amount available, in grams unless amounts_in_moles is set
    amounts: dict[str, float] = field(default_factory=dict)
    amounts_in_moles: bool = False
    product: str | None = None
    actual_yield_g: float | None = None
    # element -> mass percent (or grams; the ratio is what matters)
    composition: dict[str, float] = field(default_factory=dict)
    target_molar_mass: float | None = None


def _require(value, name: str):
    if value is None:
        raise StoichiometryError(f"this task needs {name}")
    return value


def _mass_breakdown(solution: WorkedSolution, formula: str) -> float:
    """Add the per-element mass contributions students actually write down."""
    atoms, _ = parse_formula(formula)
    total = 0.0
    for symbol in sorted(atoms):
        count = atoms[symbol]
        contribution = atomic_weight(symbol) * count
        total += contribution
        solution.add(
            f"mass of {symbol} in {formula}",
            contribution,
            "g/mol",
            "molar_mass",
            f"{count} x {atomic_weight(symbol):.3f} g/mol",
            symbol.lower(),
        )
    solution.add(
        f"molar mass of {formula}",
        total,
        "g/mol",
        "molar_mass",
        "sum of the element contributions",
        "m",
        "mm",
        "molar mass",
    )
    return total


def _moles_available(problem: StoichiometryProblem, solution: WorkedSolution) -> dict[str, float]:
    moles: dict[str, float] = {}
    for formula, amount in problem.amounts.items():
        if problem.amounts_in_moles:
            moles[formula] = amount
        else:
            mass = molar_mass(formula)
            solution.add(
                f"molar mass of {formula}",
                mass,
                "g/mol",
                "molar_mass",
                "sum of the element contributions",
            )
            moles[formula] = amount / mass
        solution.add(
            f"moles of {formula}",
            moles[formula],
            "mol",
            "amount",
            "n = m / M",
            f"n({formula})".lower(),
        )
    return moles


def _limiting(
    problem: StoichiometryProblem,
    solution: WorkedSolution,
) -> tuple[str, dict[str, int], list[tuple[int, str]], list[tuple[int, str]]]:
    equation = _require(problem.equation, "a chemical equation")
    left, right = parse_equation(equation)
    left_coefficients, right_coefficients = balance_coefficients(equation)
    coefficients = {
        formula: coefficient
        for coefficient, (_, formula) in zip(
            left_coefficients + right_coefficients, left + right
        )
    }
    solution.notes.append(
        "balanced: "
        + " + ".join(
            f"{c}{f}" for c, (_, f) in zip(left_coefficients, left)
        )
        + " -> "
        + " + ".join(
            f"{c}{f}" for c, (_, f) in zip(right_coefficients, right)
        )
    )

    reactants = [formula for _, formula in left]
    if not problem.amounts:
        raise StoichiometryError("this task needs an amount for each reactant")
    unknown = sorted(set(problem.amounts) - set(coefficients))
    if unknown:
        raise StoichiometryError(
            f"{', '.join(unknown)} does not appear in the equation"
        )
    missing = [formula for formula in reactants if formula not in problem.amounts]
    if missing:
        raise StoichiometryError(
            f"no amount given for {', '.join(missing)}"
        )

    moles = _moles_available(problem, solution)
    ratios = {}
    for formula in reactants:
        ratio = moles[formula] / coefficients[formula]
        ratios[formula] = ratio
        solution.add(
            f"mole ratio for {formula}",
            ratio,
            "mol",
            "amount",
            "moles divided by the balanced coefficient",
        )

    limiting_formula = min(ratios, key=ratios.get)
    return limiting_formula, coefficients, left, right


def solve_stoichiometry(problem: StoichiometryProblem) -> WorkedSolution:
    """Solve one stoichiometry problem completely."""
    if problem.task not in TASKS:
        raise StoichiometryError(f"unknown task {problem.task!r}")
    solution = WorkedSolution(task=problem.task)

    if problem.task == "molar_mass":
        _mass_breakdown(solution, _require(problem.formula, "a formula"))
        return solution

    if problem.task == "percent_composition":
        formula = _require(problem.formula, "a formula")
        total = _mass_breakdown(solution, formula)
        percentages = percent_composition(formula)
        chosen = problem.element
        for symbol in sorted(percentages):
            if chosen and symbol != chosen:
                continue
            solution.add(
                f"percent {symbol} in {formula}",
                percentages[symbol],
                "%",
                "percent",
                "element mass divided by molar mass, times 100",
                f"%{symbol}".lower(),
                symbol.lower(),
            )
        if not chosen:
            solution.notes.append(f"total molar mass {total:.4g} g/mol")
        return solution

    if problem.task == "moles_from_mass":
        formula = _require(problem.formula, "a formula")
        mass = float(_require(problem.mass_g, "a mass in grams"))
        total = _mass_breakdown(solution, formula)
        solution.add(
            f"moles of {formula}", mass / total, "mol", "amount", "n = m / M", "n"
        )
        return solution

    if problem.task == "mass_from_moles":
        formula = _require(problem.formula, "a formula")
        moles = float(_require(problem.moles, "an amount in moles"))
        total = _mass_breakdown(solution, formula)
        solution.add(
            f"mass of {formula}", moles * total, "g", "mass", "m = n x M", "m"
        )
        return solution

    if problem.task == "particles_from_moles":
        moles = float(_require(problem.moles, "an amount in moles"))
        solution.add(
            "number of particles",
            moles * AVOGADRO,
            None,
            None,
            "N = n x 6.022e23",
            "n",
            "particles",
        )
        return solution

    if problem.task == "moles_from_particles":
        particles = float(_require(problem.particles, "a number of particles"))
        solution.add(
            "moles",
            particles / AVOGADRO,
            "mol",
            "amount",
            "n = N / 6.022e23",
            "n",
        )
        return solution

    if problem.task in ("empirical_formula", "molecular_formula"):
        composition = problem.composition
        if not composition:
            raise StoichiometryError("this task needs a composition by element")
        if len(composition) > MAX_ELEMENTS_IN_COMPOSITION:
            raise StoichiometryError("too many elements in the composition")

        element_moles: dict[str, float] = {}
        for symbol in sorted(composition):
            amount = float(composition[symbol])
            if amount <= 0:
                raise StoichiometryError(f"amount for {symbol} must be positive")
            element_moles[symbol] = amount / atomic_weight(symbol)
            solution.add(
                f"moles of {symbol}",
                element_moles[symbol],
                "mol",
                "amount",
                "assume 100 g, then n = m / M",
                f"n({symbol})".lower(),
            )

        smallest = min(element_moles.values())
        for symbol in sorted(element_moles):
            solution.add(
                f"{symbol} ratio",
                element_moles[symbol] / smallest,
                None,
                None,
                "divide every amount by the smallest",
            )

        counts = _whole_number_ratio(element_moles)
        empirical = _format_formula(counts)
        empirical_mass = molar_mass(empirical)
        solution.add(
            f"molar mass of {empirical}",
            empirical_mass,
            "g/mol",
            "molar_mass",
            "sum of the element contributions",
        )

        if problem.task == "empirical_formula":
            solution.formula_answer = empirical
            solution.notes.append(f"empirical formula {empirical}")
            return solution

        target = float(_require(problem.target_molar_mass, "the molar mass"))
        multiplier = target / empirical_mass
        solution.add(
            "formula multiplier",
            multiplier,
            None,
            None,
            "molar mass divided by the empirical formula mass",
            "n",
        )
        whole = int(round(multiplier))
        if whole < 1 or abs(multiplier - whole) > 0.1 * max(1, whole):
            raise StoichiometryError(
                "the molar mass is not a whole multiple of the empirical mass"
            )
        molecular = _format_formula(
            {symbol: count * whole for symbol, count in counts.items()}
        )
        solution.formula_answer = molecular
        solution.notes.append(
            f"empirical formula {empirical}, molecular formula {molecular}"
        )
        return solution

    if problem.task == "limiting_reagent":
        limiting_formula, _, _, _ = _limiting(problem, solution)
        solution.species_answer = limiting_formula
        solution.notes.append(f"limiting reagent {limiting_formula}")
        return solution

    if problem.task in ("theoretical_yield", "percent_yield"):
        limiting_formula, coefficients, _, right = _limiting(problem, solution)
        product = _require(problem.product, "a product formula")
        if product not in coefficients:
            raise StoichiometryError(f"{product} does not appear in the equation")
        if product not in {formula for _, formula in right}:
            raise StoichiometryError(f"{product} is not a product of this reaction")

        limiting_moles = next(
            step.quantity.value
            for step in solution.steps
            if step.name == f"moles of {limiting_formula}"
        )
        product_moles = (
            limiting_moles
            * coefficients[product]
            / coefficients[limiting_formula]
        )
        solution.add(
            f"moles of {product}",
            product_moles,
            "mol",
            "amount",
            "limiting moles scaled by the mole ratio",
            f"n({product})".lower(),
        )
        product_mass = molar_mass(product)
        solution.add(
            f"molar mass of {product}",
            product_mass,
            "g/mol",
            "molar_mass",
            "sum of the element contributions",
        )
        theoretical = product_moles * product_mass
        solution.add(
            f"theoretical yield of {product}",
            theoretical,
            "g",
            "mass",
            "m = n x M",
            "theoretical yield",
            "m",
        )
        solution.notes.append(f"limiting reagent {limiting_formula}")

        if problem.task == "theoretical_yield":
            return solution

        actual = float(_require(problem.actual_yield_g, "the actual yield in grams"))
        if actual < 0:
            raise StoichiometryError("the actual yield cannot be negative")
        solution.add(
            "percent yield",
            100.0 * actual / theoretical,
            "%",
            "percent",
            "actual divided by theoretical, times 100",
            "percent yield",
            "yield",
        )
        return solution

    raise StoichiometryError(f"unhandled task {problem.task!r}")


def _formula_matches(written: str, target: str) -> bool:
    """Compare two formulas as element counts, not as strings."""
    try:
        written_atoms, _ = parse_formula(written)
        target_atoms, _ = parse_formula(target)
    except EquationParseError:
        return False
    return written_atoms == target_atoms


class StoichiometryJudge(
    Judge[StoichiometryProblem, ChemistryStep, ChemistryLineVerdict]
):
    """Checks each written line against the fully solved problem.

    A line may be an intermediate quantity, the final number, or -- for
    empirical-formula and limiting-reagent tasks -- a formula or a species
    name. Anything that is not one of those and is not readable at all is a
    `parse_error`, which is our limitation and never the student's mistake.
    """

    def check(
        self,
        problem: StoichiometryProblem,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        try:
            solution = solve_stoichiometry(problem)
        except (StoichiometryError, EquationUnbalanceableError) as exc:
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
                    detail=f"Could not parse the problem: {exc}",
                    judged_by="deterministic",
                )
            ]
        except Exception:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail="This problem could not be solved safely",
                    judged_by="deterministic",
                )
            ]

        return judge_solution_steps(solution, steps)


def judge_solution_steps(
    solution: WorkedSolution,
    steps: list[ChemistryStep],
) -> list[ChemistryLineVerdict]:
    """Judge lines against a solved problem, symbols first, then numbers."""
    symbolic_answer = solution.formula_answer or solution.species_answer
    if symbolic_answer is None:
        return judge_quantity_steps(solution, steps)

    verdicts: list[ChemistryLineVerdict] = []
    for step in steps:
        text = step.smiles.strip()
        candidate = text.split("=")[-1].strip() if "=" in text else text
        looks_numeric = True
        try:
            parse_quantity(text)
        except QuantityParseError:
            looks_numeric = False

        if not looks_numeric and candidate:
            if _formula_matches(candidate, symbolic_answer):
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=True,
                        detail="Matches the correct formula",
                        judged_by="deterministic",
                    )
                )
                continue
            try:
                parse_formula(candidate)
            except EquationParseError as exc:
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
            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=False,
                    error_type=(
                        "wrong_species"
                        if solution.species_answer
                        else "wrong_formula"
                    ),
                    detail="This is not the formula the working produces",
                    judged_by="deterministic",
                )
            )
            continue

        verdicts.extend(judge_quantity_steps(solution, [step]))
    return verdicts


__all__ = [
    "AVOGADRO",
    "StoichiometryError",
    "StoichiometryJudge",
    "StoichiometryProblem",
    "TASKS",
    "atomic_weight",
    "judge_solution_steps",
    "molar_mass",
    "percent_composition",
    "solve_stoichiometry",
]
