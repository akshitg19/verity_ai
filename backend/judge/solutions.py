"""Solutions, acids, bases, and equilibrium: chemistry subject 4.

`final_tasks.md` calls this the highest value-per-effort subject on either
list, and the reason is visible in the imports: molarity, dilution, pH, Ka,
Henderson-Hasselbalch, and ICE tables are arithmetic and algebra on known
constants. No new dependency, no model, nothing that can hallucinate.

Every task returns a `WorkedSolution`, so the intermediate quantities a
student legitimately writes down -- moles before molarity, [H+] before pH --
are checked as valid working rather than flagged because they are not the
final number.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from schemas import ChemistryLineVerdict, ChemistryStep
from .base import Judge
from .chemistry_equations import EquationParseError
from .numeric import WorkedSolution, judge_quantity_steps
from .stoichiometry import StoichiometryError, molar_mass


KW = 1.0e-14  # ionic product of water at 25 C

TASKS = (
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
)


class SolutionsError(ValueError):
    """The problem as stated cannot be solved as written."""


@dataclass(frozen=True)
class SolutionsProblem:
    task: str
    formula: str | None = None
    moles: float | None = None
    mass_g: float | None = None
    volume_l: float | None = None
    concentration_m: float | None = None
    initial_concentration_m: float | None = None
    initial_volume_l: float | None = None
    final_concentration_m: float | None = None
    final_volume_l: float | None = None
    hydrogen_concentration_m: float | None = None
    hydroxide_concentration_m: float | None = None
    ph: float | None = None
    ka: float | None = None
    kb: float | None = None
    pka: float | None = None
    acid_concentration_m: float | None = None
    base_concentration_m: float | None = None
    protons: int = 1
    hydroxides: int = 1
    titrant_concentration_m: float | None = None
    titrant_volume_l: float | None = None
    analyte_volume_l: float | None = None
    solute_mass_g: float | None = None
    solution_mass_g: float | None = None


def _require(value, name: str):
    if value is None:
        raise SolutionsError(f"this task needs {name}")
    return value


def _add_ph_family(
    solution: WorkedSolution,
    hydrogen: float,
    *,
    technique: str = "pH = -log10[H+]",
    suffix: str = "",
) -> None:
    """Given [H+], record the whole family a student may write any of.

    pH, pOH, [H+], and [OH-] are four statements of one fact. Marking a
    student wrong for writing pOH when the question asked for pH would be
    measuring compliance, not chemistry.
    """
    if hydrogen <= 0:
        raise SolutionsError("hydrogen ion concentration must be positive")
    hydroxide = KW / hydrogen
    ph = -math.log10(hydrogen)
    poh = 14.0 + math.log10(hydrogen)

    solution.add(
        f"hydrogen ion concentration{suffix}",
        hydrogen,
        "M",
        "concentration",
        technique,
        "[h+]",
        "h+",
        "c",
        "x",
    )
    solution.add(
        f"hydroxide ion concentration{suffix}",
        hydroxide,
        "M",
        "concentration",
        "[OH-] = Kw / [H+]",
        "[oh-]",
        "oh-",
    )
    solution.add(f"pH{suffix}", ph, None, "log_concentration", technique, "ph")
    solution.add(
        f"pOH{suffix}", poh, None, "log_concentration", "pOH = 14 - pH", "poh"
    )
    # All four are the answer. A hint that withholds pH while handing over
    # pOH has handed over the answer.
    solution.mark_answers(
        f"pH{suffix}",
        f"pOH{suffix}",
        f"hydrogen ion concentration{suffix}",
        f"hydroxide ion concentration{suffix}",
    )


def solve_solutions(problem: SolutionsProblem) -> WorkedSolution:
    """Solve one solutions/acid-base problem completely."""
    if problem.task not in TASKS:
        raise SolutionsError(f"unknown task {problem.task!r}")
    solution = WorkedSolution(task=problem.task)

    if problem.task == "molarity":
        volume = float(_require(problem.volume_l, "a volume in litres"))
        if problem.moles is not None:
            moles = float(problem.moles)
        else:
            formula = _require(problem.formula, "a solute formula")
            mass = float(_require(problem.mass_g, "a mass in grams"))
            mass_per_mole = molar_mass(formula)
            solution.add(
                f"molar mass of {formula}",
                mass_per_mole,
                "g/mol",
                "molar_mass",
                "sum of the element contributions",
            )
            moles = mass / mass_per_mole
        solution.add("moles of solute", moles, "mol", "amount", "n = m / M", "n")
        solution.add(
            "molarity", moles / volume, "M", "concentration", "M = n / V", "m", "c"
        )
        return solution

    if problem.task == "moles_from_molarity":
        concentration = float(_require(problem.concentration_m, "a molarity"))
        volume = float(_require(problem.volume_l, "a volume in litres"))
        solution.add(
            "moles of solute",
            concentration * volume,
            "mol",
            "amount",
            "n = M x V",
            "n",
        )
        return solution

    if problem.task == "volume_from_molarity":
        concentration = float(_require(problem.concentration_m, "a molarity"))
        moles = float(_require(problem.moles, "an amount in moles"))
        solution.add(
            "volume of solution",
            moles / concentration,
            "L",
            "volume",
            "V = n / M",
            "v",
        )
        return solution

    if problem.task == "dilution":
        known = {
            "initial_concentration_m": problem.initial_concentration_m,
            "initial_volume_l": problem.initial_volume_l,
            "final_concentration_m": problem.final_concentration_m,
            "final_volume_l": problem.final_volume_l,
        }
        missing = [name for name, value in known.items() if value is None]
        if len(missing) != 1:
            raise SolutionsError(
                "a dilution problem needs exactly three of M1, V1, M2, V2"
            )
        c1, v1, c2, v2 = (
            known["initial_concentration_m"],
            known["initial_volume_l"],
            known["final_concentration_m"],
            known["final_volume_l"],
        )
        if missing[0] == "initial_concentration_m":
            value, unit, dimension, name = c2 * v2 / v1, "M", "concentration", "M1"
        elif missing[0] == "initial_volume_l":
            value, unit, dimension, name = c2 * v2 / c1, "L", "volume", "V1"
        elif missing[0] == "final_concentration_m":
            value, unit, dimension, name = c1 * v1 / v2, "M", "concentration", "M2"
        else:
            value, unit, dimension, name = c1 * v1 / c2, "L", "volume", "V2"

        moles = (c1 * v1) if c1 is not None and v1 is not None else c2 * v2
        solution.add(
            "moles of solute",
            moles,
            "mol",
            "amount",
            "diluting changes the volume, not the amount of solute",
            "n",
        )
        solution.add(
            name, value, unit, dimension, "M1V1 = M2V2", name.lower(), "c", "v"
        )
        return solution

    if problem.task == "ph_from_concentration":
        hydrogen = float(
            _require(problem.hydrogen_concentration_m, "a [H+] in mol/L")
        )
        _add_ph_family(solution, hydrogen)
        return solution

    if problem.task == "poh_from_concentration":
        hydroxide = float(
            _require(problem.hydroxide_concentration_m, "an [OH-] in mol/L")
        )
        if hydroxide <= 0:
            raise SolutionsError("hydroxide concentration must be positive")
        _add_ph_family(solution, KW / hydroxide, technique="[H+] = Kw / [OH-]")
        return solution

    if problem.task == "ph_from_ph":
        ph = float(_require(problem.ph, "a pH"))
        _add_ph_family(solution, 10.0**-ph, technique="[H+] = 10^-pH")
        return solution

    if problem.task == "strong_acid_ph":
        concentration = float(
            _require(problem.concentration_m, "an acid concentration")
        )
        protons = max(1, int(problem.protons))
        hydrogen = concentration * protons
        if protons > 1:
            solution.notes.append(
                f"a strong acid releasing {protons} protons per formula unit"
            )
        _add_ph_family(
            solution,
            hydrogen,
            technique="a strong acid dissociates completely, so [H+] = c",
        )
        return solution

    if problem.task == "strong_base_ph":
        concentration = float(
            _require(problem.concentration_m, "a base concentration")
        )
        hydroxides = max(1, int(problem.hydroxides))
        hydroxide = concentration * hydroxides
        solution.add(
            "hydroxide ion concentration",
            hydroxide,
            "M",
            "concentration",
            "a strong base dissociates completely",
            "[oh-]",
            "oh-",
        )
        _add_ph_family(solution, KW / hydroxide, technique="[H+] = Kw / [OH-]")
        return solution

    if problem.task in ("weak_acid_ph", "weak_base_ph"):
        concentration = float(
            _require(problem.concentration_m, "an initial concentration")
        )
        acid = problem.task == "weak_acid_ph"
        constant = float(
            _require(
                problem.ka if acid else problem.kb,
                "a Ka value" if acid else "a Kb value",
            )
        )

        # Solve the ICE table exactly rather than assuming x is negligible:
        # x^2 + Kx - Kc = 0. The approximation is what students are taught to
        # check, so the judge must not depend on it being valid.
        discriminant = constant * constant + 4.0 * constant * concentration
        x = (-constant + math.sqrt(discriminant)) / 2.0
        approximate = math.sqrt(constant * concentration)

        solution.add(
            "equilibrium x",
            x,
            "M",
            "concentration",
            "exact root of x^2 + Kx - Kc = 0 from the ICE table",
            "x",
        )
        if abs(approximate - x) <= 0.05 * x:
            # Within 5%, the taught approximation is the accepted answer too,
            # so a student who used it must not be marked wrong.
            solution.add(
                "equilibrium x by approximation",
                approximate,
                "M",
                "concentration",
                "x = sqrt(K x c), valid because x is small next to c",
                "x",
            )
            solution.notes.append("the small-x approximation is valid here")
        else:
            solution.notes.append(
                "the small-x approximation is NOT valid here; the quadratic is needed"
            )

        percent_ionisation = 100.0 * x / concentration
        solution.add(
            "percent ionisation",
            percent_ionisation,
            "%",
            "percent",
            "x divided by the initial concentration, times 100",
        )
        solution.add(
            "pK",
            -math.log10(constant),
            None,
            "log_concentration",
            "pK = -log10(K)",
            "pka",
            "pkb",
        )
        if acid:
            _add_ph_family(solution, x, technique="[H+] = x from the ICE table")
        else:
            _add_ph_family(solution, KW / x, technique="[H+] = Kw / [OH-]")

        # A student who used the taught approximation gets a pH a few
        # thousandths away from the exact root. We already accept their x;
        # accepting their x and then flagging the pH they derived from it
        # would be the judge contradicting itself.
        if abs(approximate - x) <= 0.05 * x:
            approximate_hydrogen = approximate if acid else KW / approximate
            _add_ph_family(
                solution,
                approximate_hydrogen,
                technique="from the small-x approximation",
                suffix=" by approximation",
            )
        return solution

    if problem.task == "buffer_ph":
        acid = float(_require(problem.acid_concentration_m, "the acid concentration"))
        base = float(
            _require(problem.base_concentration_m, "the conjugate base concentration")
        )
        if problem.pka is not None:
            pka = float(problem.pka)
            ka = 10.0**-pka
        else:
            ka = float(_require(problem.ka, "a Ka or pKa"))
            pka = -math.log10(ka)
        solution.add("pKa", pka, None, "log_concentration", "pKa = -log10(Ka)", "pka")
        ratio = base / acid
        solution.add(
            "base to acid ratio",
            ratio,
            None,
            None,
            "[A-] / [HA]",
            "ratio",
        )
        ph = pka + math.log10(ratio)
        _add_ph_family(
            solution,
            10.0**-ph,
            technique="Henderson-Hasselbalch: pH = pKa + log([A-]/[HA])",
        )
        return solution

    if problem.task == "titration_concentration":
        titrant_c = float(
            _require(problem.titrant_concentration_m, "the titrant concentration")
        )
        titrant_v = float(
            _require(problem.titrant_volume_l, "the titrant volume in litres")
        )
        analyte_v = float(
            _require(problem.analyte_volume_l, "the analyte volume in litres")
        )
        protons = max(1, int(problem.protons))
        hydroxides = max(1, int(problem.hydroxides))

        moles_titrant = titrant_c * titrant_v
        solution.add(
            "moles of titrant",
            moles_titrant,
            "mol",
            "amount",
            "n = M x V",
            "n",
        )
        moles_analyte = moles_titrant * hydroxides / protons
        solution.add(
            "moles of analyte",
            moles_analyte,
            "mol",
            "amount",
            "scaled by the neutralisation ratio",
        )
        solution.add(
            "analyte concentration",
            moles_analyte / analyte_v,
            "M",
            "concentration",
            "M = n / V",
            "m",
            "c",
        )
        return solution

    if problem.task == "percent_by_mass":
        solute = float(_require(problem.solute_mass_g, "the solute mass in grams"))
        total = float(_require(problem.solution_mass_g, "the solution mass in grams"))
        if solute > total:
            raise SolutionsError("the solute cannot outweigh the solution")
        solution.add(
            "percent by mass",
            100.0 * solute / total,
            "%",
            "percent",
            "solute mass divided by solution mass, times 100",
            "percent",
        )
        return solution

    raise SolutionsError(f"unhandled task {problem.task!r}")


class SolutionsJudge(Judge[SolutionsProblem, ChemistryStep, ChemistryLineVerdict]):
    """Checks each written line against the fully solved solution problem."""

    def check(
        self,
        problem: SolutionsProblem,
        steps: list[ChemistryStep],
        *,
        answers_only: bool = False,
    ) -> list[ChemistryLineVerdict]:
        try:
            solution = solve_solutions(problem)
        except (SolutionsError, StoichiometryError) as exc:
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

        return judge_quantity_steps(solution, steps, answers_only=answers_only)


__all__ = [
    "KW",
    "SolutionsError",
    "SolutionsJudge",
    "SolutionsProblem",
    "TASKS",
    "solve_solutions",
]
