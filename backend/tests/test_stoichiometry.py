import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from judge.stoichiometry import (
    StoichiometryError,
    StoichiometryJudge,
    StoichiometryProblem,
    molar_mass,
    percent_composition,
    solve_stoichiometry,
)
from schemas import ChemistryStep


judge = StoichiometryJudge()


def check(problem: StoichiometryProblem, *lines: str):
    steps = [
        ChemistryStep(line_number=index + 1, smiles=value)
        for index, value in enumerate(lines)
    ]
    return judge.check(problem, steps)


def statuses(verdicts):
    return [verdict.status for verdict in verdicts]


# ---------------------------------------------------------------------------
# Molar mass and composition
# ---------------------------------------------------------------------------


def test_molar_mass_of_water():
    assert molar_mass("H2O") == pytest.approx(18.015, abs=0.01)


def test_molar_mass_handles_parentheses():
    assert molar_mass("(NH4)2SO4") == pytest.approx(132.14, abs=0.05)


def test_molar_mass_handles_a_hydrate_style_nested_group():
    assert molar_mass("Ca(NO3)2") == pytest.approx(164.09, abs=0.05)


def test_percent_composition_sums_to_one_hundred():
    percentages = percent_composition("C6H12O6")

    assert sum(percentages.values()) == pytest.approx(100.0, abs=0.01)
    assert percentages["C"] == pytest.approx(40.0, abs=0.1)


def test_unknown_element_is_rejected_rather_than_guessed():
    with pytest.raises(Exception):
        molar_mass("Zz2O")


# ---------------------------------------------------------------------------
# Solving
# ---------------------------------------------------------------------------


def test_moles_from_mass():
    solution = solve_stoichiometry(
        StoichiometryProblem(task="moles_from_mass", formula="H2O", mass_g=36.03)
    )

    assert solution.answer.quantity.value == pytest.approx(2.0, rel=1e-3)
    assert solution.answer.quantity.unit == "mol"


def test_empirical_formula_from_percent_composition():
    solution = solve_stoichiometry(
        StoichiometryProblem(
            task="empirical_formula",
            composition={"C": 40.0, "H": 6.7, "O": 53.3},
        )
    )

    assert solution.formula_answer == "CH2O"


def test_empirical_formula_scales_a_half_ratio_rather_than_rounding_it():
    """A 1 : 1.5 ratio is C2H3-style, not CH2. Rounding 1.5 to 2 is the
    classic wrong empirical formula and must not be reachable."""
    solution = solve_stoichiometry(
        StoichiometryProblem(
            task="empirical_formula",
            composition={"C": 92.3, "H": 7.7},
        )
    )

    assert solution.formula_answer == "CH"


def test_molecular_formula_uses_the_molar_mass_multiplier():
    solution = solve_stoichiometry(
        StoichiometryProblem(
            task="molecular_formula",
            composition={"C": 40.0, "H": 6.7, "O": 53.3},
            target_molar_mass=180.0,
        )
    )

    assert solution.formula_answer == "C6H12O6"


def test_limiting_reagent_is_the_one_with_the_smallest_mole_ratio():
    solution = solve_stoichiometry(
        StoichiometryProblem(
            task="limiting_reagent",
            equation="N2 + H2 -> NH3",
            amounts={"N2": 28.0, "H2": 6.0},
        )
    )

    assert solution.species_answer == "H2"


def test_percent_yield_is_actual_over_theoretical():
    solution = solve_stoichiometry(
        StoichiometryProblem(
            task="percent_yield",
            equation="N2 + H2 -> NH3",
            amounts={"N2": 28.0, "H2": 6.0},
            product="NH3",
            actual_yield_g=25.0,
        )
    )

    assert solution.answer.name == "percent yield"
    assert solution.answer.quantity.value == pytest.approx(74.0, abs=0.5)


def test_a_product_that_is_not_in_the_equation_is_refused():
    with pytest.raises(StoichiometryError, match="does not appear"):
        solve_stoichiometry(
            StoichiometryProblem(
                task="theoretical_yield",
                equation="N2 + H2 -> NH3",
                amounts={"N2": 28.0, "H2": 6.0},
                product="H2O",
            )
        )


def test_a_missing_reactant_amount_is_refused_rather_than_assumed():
    with pytest.raises(StoichiometryError, match="no amount given"):
        solve_stoichiometry(
            StoichiometryProblem(
                task="limiting_reagent",
                equation="N2 + H2 -> NH3",
                amounts={"N2": 28.0},
            )
        )


# ---------------------------------------------------------------------------
# Judging written lines
# ---------------------------------------------------------------------------


def test_the_final_answer_is_valid():
    problem = StoichiometryProblem(task="molar_mass", formula="H2O")

    assert statuses(check(problem, "18.02 g/mol")) == ["valid"]


def test_an_intermediate_quantity_is_valid_working_not_a_mistake():
    """A student is allowed to write the element contributions down."""
    problem = StoichiometryProblem(task="molar_mass", formula="H2SO4")

    assert statuses(check(problem, "64.0 g/mol", "98.08 g/mol")) == [
        "valid",
        "valid",
    ]


def test_a_wrong_number_is_invalid():
    problem = StoichiometryProblem(task="molar_mass", formula="H2O")
    verdicts = check(problem, "12.0 g/mol")

    assert verdicts[0].status == "invalid"
    assert verdicts[0].error_type == "wrong_value"


def test_the_right_number_in_the_wrong_unit_is_told_apart():
    problem = StoichiometryProblem(
        task="moles_from_mass", formula="H2O", mass_g=36.03
    )
    verdicts = check(problem, "2.0 g")

    assert verdicts[0].status == "invalid"
    assert verdicts[0].error_type == "wrong_unit"


def test_unreadable_text_is_a_parse_error_not_a_student_mistake():
    problem = StoichiometryProblem(task="molar_mass", formula="H2O")
    verdicts = check(problem, "I think it is heavier")

    assert verdicts[0].status == "parse_error"


def test_a_formula_answer_is_compared_as_atoms_not_as_a_string():
    problem = StoichiometryProblem(
        task="empirical_formula", composition={"C": 40.0, "H": 6.7, "O": 53.3}
    )

    assert statuses(check(problem, "CH2O", "H2CO")) == ["valid", "valid"]


def test_a_wrong_formula_answer_is_flagged_as_a_formula_error():
    problem = StoichiometryProblem(
        task="empirical_formula", composition={"C": 40.0, "H": 6.7, "O": 53.3}
    )
    verdicts = check(problem, "C2H4O2")

    assert verdicts[0].status == "invalid"
    assert verdicts[0].error_type == "wrong_formula"


def test_an_unsolvable_problem_reports_line_zero():
    verdicts = check(StoichiometryProblem(task="molar_mass"), "18 g/mol")

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "unsupported"


def test_every_verdict_is_labelled_deterministic():
    problem = StoichiometryProblem(task="molar_mass", formula="H2O")

    assert all(v.judged_by == "deterministic" for v in check(problem, "18.02 g/mol"))
