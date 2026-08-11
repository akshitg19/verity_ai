import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from judge.solutions import (
    SolutionsError,
    SolutionsJudge,
    SolutionsProblem,
    solve_solutions,
)
from schemas import ChemistryStep


judge = SolutionsJudge()


def check(problem: SolutionsProblem, *lines: str):
    steps = [
        ChemistryStep(line_number=index + 1, smiles=value)
        for index, value in enumerate(lines)
    ]
    return judge.check(problem, steps)


def named(solution, name: str) -> float:
    return next(
        step.quantity.value for step in solution.steps if step.name == name
    )


# ---------------------------------------------------------------------------
# Molarity and dilution
# ---------------------------------------------------------------------------


def test_molarity_from_mass():
    solution = solve_solutions(
        SolutionsProblem(
            task="molarity", formula="NaCl", mass_g=5.85, volume_l=1.0
        )
    )

    assert solution.answer.quantity.value == pytest.approx(0.1, rel=1e-2)
    assert solution.answer.quantity.unit == "M"


def test_dilution_solves_for_whichever_value_is_missing():
    solution = solve_solutions(
        SolutionsProblem(
            task="dilution",
            initial_concentration_m=2.0,
            initial_volume_l=0.05,
            final_volume_l=0.5,
        )
    )

    assert solution.answer.quantity.value == pytest.approx(0.2)


def test_dilution_needs_exactly_three_of_the_four_values():
    with pytest.raises(SolutionsError, match="exactly three"):
        solve_solutions(
            SolutionsProblem(
                task="dilution", initial_concentration_m=2.0, initial_volume_l=0.05
            )
        )


# ---------------------------------------------------------------------------
# pH
# ---------------------------------------------------------------------------


def test_ph_of_a_strong_acid():
    solution = solve_solutions(
        SolutionsProblem(task="strong_acid_ph", concentration_m=0.01)
    )

    assert named(solution, "pH") == pytest.approx(2.0)
    assert named(solution, "pOH") == pytest.approx(12.0)


def test_a_diprotic_strong_acid_doubles_the_proton_concentration():
    solution = solve_solutions(
        SolutionsProblem(task="strong_acid_ph", concentration_m=0.05, protons=2)
    )

    assert named(solution, "hydrogen ion concentration") == pytest.approx(0.1)


def test_ph_of_a_strong_base():
    solution = solve_solutions(
        SolutionsProblem(task="strong_base_ph", concentration_m=0.01)
    )

    assert named(solution, "pH") == pytest.approx(12.0)


def test_weak_acid_ph_uses_the_exact_ice_root():
    solution = solve_solutions(
        SolutionsProblem(task="weak_acid_ph", concentration_m=0.1, ka=1.8e-5)
    )

    assert named(solution, "pH") == pytest.approx(2.88, abs=0.01)


def test_weak_acid_records_when_the_small_x_approximation_holds():
    solution = solve_solutions(
        SolutionsProblem(task="weak_acid_ph", concentration_m=0.1, ka=1.8e-5)
    )

    assert any("approximation is valid" in note for note in solution.notes)


def test_weak_acid_records_when_the_approximation_fails():
    """A large Ka next to a small concentration is exactly the case the
    taught shortcut gets wrong, and the solver must not depend on it."""
    solution = solve_solutions(
        SolutionsProblem(task="weak_acid_ph", concentration_m=0.001, ka=1.0e-2)
    )

    assert any("NOT valid" in note for note in solution.notes)


def test_buffer_ph_is_pka_when_the_ratio_is_one():
    solution = solve_solutions(
        SolutionsProblem(
            task="buffer_ph",
            acid_concentration_m=0.1,
            base_concentration_m=0.1,
            pka=4.74,
        )
    )

    assert named(solution, "pH") == pytest.approx(4.74)


def test_buffer_ph_shifts_with_the_ratio():
    solution = solve_solutions(
        SolutionsProblem(
            task="buffer_ph",
            acid_concentration_m=0.1,
            base_concentration_m=1.0,
            pka=4.74,
        )
    )

    assert named(solution, "pH") == pytest.approx(5.74, abs=0.01)


def test_titration_concentration():
    solution = solve_solutions(
        SolutionsProblem(
            task="titration_concentration",
            titrant_concentration_m=0.1,
            titrant_volume_l=0.025,
            analyte_volume_l=0.020,
        )
    )

    assert solution.answer.quantity.value == pytest.approx(0.125)


def test_percent_by_mass_cannot_exceed_the_solution():
    with pytest.raises(SolutionsError, match="outweigh"):
        solve_solutions(
            SolutionsProblem(
                task="percent_by_mass", solute_mass_g=10.0, solution_mass_g=5.0
            )
        )


# ---------------------------------------------------------------------------
# Judging
# ---------------------------------------------------------------------------


def test_any_member_of_the_ph_family_counts_as_working():
    """pH, pOH, [H+], and [OH-] are four statements of one fact. Marking a
    student wrong for writing pOH would measure compliance, not chemistry."""
    problem = SolutionsProblem(task="strong_acid_ph", concentration_m=0.01)
    verdicts = check(problem, "pH = 2.0", "pOH = 12.0", "[H+] = 0.01 M")

    assert [verdict.status for verdict in verdicts] == ["valid", "valid", "valid"]


def test_a_wrong_ph_is_flagged():
    problem = SolutionsProblem(task="strong_acid_ph", concentration_m=0.01)
    verdicts = check(problem, "pH = 4.0")

    assert verdicts[0].status == "invalid"
    assert verdicts[0].error_type == "wrong_value"


def test_the_student_may_use_the_taught_approximation():
    problem = SolutionsProblem(task="weak_acid_ph", concentration_m=0.1, ka=1.8e-5)
    verdicts = check(problem, "x = 1.34 x 10^-3 M")

    assert verdicts[0].status == "valid"


def test_an_unsolvable_problem_reports_line_zero():
    verdicts = check(SolutionsProblem(task="molarity"), "0.1 M")

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "unsupported"


# ---------------------------------------------------------------------------
# The fatal category: a confident valid on a wrong line.
#
# Found by backend/scripts/student_walkthrough.py, not by this suite. A pH
# answer group holds pH, pOH, [H+] and [OH-] so that a student may state
# whichever the question asked for, and a mislabelled value used to fall
# through to matching any member of that group. Writing "pH = 12.00" when the
# pH is 2.00 matched the pOH, and the student was told they were right.
# ---------------------------------------------------------------------------

def test_pH_and_pOH_are_not_interchangeable():
    from judge.quantities import parse_quantity
    from judge.solutions import SolutionsProblem, solve_solutions

    solution = solve_solutions(
        SolutionsProblem(task="strong_acid_ph", concentration_m=0.010)
    )

    assert solution.match(parse_quantity("pH = 2.00")) is not None
    assert solution.match(parse_quantity("pOH = 12.00")) is not None
    # The pOH value, claimed as the pH.
    assert solution.match(parse_quantity("pH = 12.00")) is None
    assert solution.match(parse_quantity("pOH = 2.00")) is None


def test_an_unknown_label_still_matches_on_value_alone():
    # The other half of the rule: a label we do not recognise must never
    # reject, or a student writing "n = 0.01" for a concentration is told
    # they are wrong when they are not.
    from judge.quantities import parse_quantity
    from judge.solutions import SolutionsProblem, solve_solutions

    solution = solve_solutions(
        SolutionsProblem(task="strong_acid_ph", concentration_m=0.010)
    )

    assert solution.match(parse_quantity("n = 0.010")) is not None
