import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fractions import Fraction

import pytest

from judge.redox import (
    CellPotentialJudge,
    CellPotentialProblem,
    OxidationStateJudge,
    OxidationStateProblem,
    RedoxError,
    oxidation_state,
    reduction_potential,
    solve_cell_potential,
)
from schemas import ChemistryStep


oxidation_judge = OxidationStateJudge()
potential_judge = CellPotentialJudge()


def check_state(formula: str, element: str, *lines: str):
    steps = [
        ChemistryStep(line_number=index + 1, smiles=value)
        for index, value in enumerate(lines)
    ]
    return oxidation_judge.check(
        OxidationStateProblem(formula=formula, element=element), steps
    )


# ---------------------------------------------------------------------------
# Oxidation states, by the rules
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "formula,element,expected",
    [
        ("O2", "O", 0),
        ("Fe", "Fe", 0),
        ("H2O", "O", -2),
        ("H2O", "H", 1),
        ("NaH", "H", -1),
        ("H2O2", "O", -1),
        ("KMnO4", "Mn", 7),
        ("Cr2O7^2-", "Cr", 6),
        ("SO4^2-", "S", 6),
        ("NH3", "N", -3),
        ("HNO3", "N", 5),
        ("CaCO3", "C", 4),
        ("OF2", "O", 2),
    ],
)
def test_oxidation_states_follow_the_standard_rules(formula, element, expected):
    assert oxidation_state(formula, element) == Fraction(expected)


def test_a_superoxide_gives_a_fractional_state():
    assert oxidation_state("KO2", "O") == Fraction(-1, 2)


def test_a_monatomic_ion_is_its_charge():
    assert oxidation_state("Fe^3+", "Fe") == Fraction(3)


def test_two_unknown_elements_is_refused_rather_than_guessed():
    """Guessing here would be a confident wrong verdict, which is the one
    failure this product cannot have."""
    with pytest.raises(RedoxError, match="no unique answer"):
        oxidation_state("SCN^-", "S")


def test_an_element_not_present_is_an_error_not_a_zero():
    with pytest.raises(RedoxError, match="does not appear"):
        oxidation_state("H2O", "S")


# ---------------------------------------------------------------------------
# Judging a written state
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("written", ["+6", "6+", "6", "VI", "(VI)", "x = 6"])
def test_a_state_is_accepted_however_it_is_written(written):
    assert check_state("Cr2O7^2-", "Cr", written)[0].status == "valid"


def test_a_wrong_state_is_flagged_with_its_own_category():
    verdicts = check_state("Cr2O7^2-", "Cr", "+7")

    assert verdicts[0].status == "invalid"
    assert verdicts[0].error_type == "wrong_oxidation_state"


def test_a_negative_state_is_read_correctly_from_either_side():
    assert check_state("H2O", "O", "-2")[0].status == "valid"
    assert check_state("H2O", "O", "2-")[0].status == "valid"


def test_an_intermediate_rule_value_counts_as_working():
    """A student writing "H is +1" on the way to the answer is working."""
    verdicts = check_state("H2SO4", "S", "H = +1")

    assert verdicts[0].status == "valid"


def test_an_unsolvable_problem_reports_line_zero():
    verdicts = check_state("SCN^-", "S", "+2")

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "unsupported"


# ---------------------------------------------------------------------------
# Cell potentials
# ---------------------------------------------------------------------------


def test_a_standard_cell_potential():
    solution = solve_cell_potential("Cu^2+ + 2e- -> Cu", "Zn^2+ + 2e- -> Zn")

    assert solution.answer.quantity.value == pytest.approx(1.10, abs=0.01)
    assert "spontaneous" in solution.notes


def test_a_half_reaction_written_as_an_oxidation_is_still_found():
    potential, was_reversed = reduction_potential("Zn -> Zn^2+ + 2e-")

    assert potential == pytest.approx(-0.76)
    assert was_reversed is True


def test_a_half_reaction_outside_the_table_is_unsupported_not_invented():
    with pytest.raises(RedoxError, match="not in the standard"):
        reduction_potential("Xe^2+ + 2e- -> Xe")


def test_a_written_cell_potential_is_judged():
    steps = [ChemistryStep(line_number=1, smiles="E = 1.10 V")]
    verdicts = potential_judge.check(
        CellPotentialProblem(cathode="Cu^2+ + 2e- -> Cu", anode="Zn^2+ + 2e- -> Zn"),
        steps,
    )

    assert verdicts[0].status == "valid"


def test_a_wrong_cell_potential_is_flagged():
    steps = [ChemistryStep(line_number=1, smiles="E = 0.42 V")]
    verdicts = potential_judge.check(
        CellPotentialProblem(cathode="Cu^2+ + 2e- -> Cu", anode="Zn^2+ + 2e- -> Zn"),
        steps,
    )

    assert verdicts[0].status == "invalid"


def test_an_unknown_half_reaction_reports_line_zero():
    steps = [ChemistryStep(line_number=1, smiles="1.0 V")]
    verdicts = potential_judge.check(
        CellPotentialProblem(cathode="Xe^2+ + 2e- -> Xe", anode="Zn^2+ + 2e- -> Zn"),
        steps,
    )

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "unsupported"


# ---------------------------------------------------------------------------
# A charge written the ordinary way, without a caret
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "formula,element,expected",
    [
        # The caret form was always right. These are the same ions written
        # the way a student writes them on paper.
        ("MnO4-", "Mn", 7),
        ("MnO4^-", "Mn", 7),
        ("NO3-", "N", 5),
        ("NH4+", "N", -3),
        ("SO42-", "S", 6),
        ("SO4^2-", "S", 6),
        ("Cr2O72-", "Cr", 6),
        ("PO43-", "P", 5),
        ("ClO4-", "Cl", 7),
        # One element takes the whole run as its charge: Fe3+ is iron three
        # plus, not three irons sharing one charge.
        ("Fe3+", "Fe", 3),
        ("Cu2+", "Cu", 2),
        ("O2-", "O", -2),
    ],
)
def test_a_charge_without_a_caret_is_read_correctly(formula, element, expected):
    """Found by the live audit, and it reached students.

    `MnO4-` parsed as MnO carrying a charge of minus four, because the
    trailing subscript was being eaten as the charge magnitude. The
    oxidation state of Mn came back as -2 instead of +7, with no error and
    no warning, and the answer vault was built from the same wrong number.
    """
    from judge.redox import oxidation_state

    assert float(oxidation_state(formula, element)) == float(expected)


@pytest.mark.parametrize(
    "formula,atoms,charge",
    [
        ("MnO4-", {"Mn": 1, "O": 4}, -1),
        ("SO42-", {"S": 1, "O": 4}, -2),
        ("NH4+", {"N": 1, "H": 4}, 1),
        ("Fe3+", {"Fe": 1}, 3),
        ("H2O", {"H": 2, "O": 1}, 0),
        ("(NH4)2SO4", {"N": 2, "H": 8, "S": 1, "O": 4}, 0),
    ],
)
def test_the_formula_parser_splits_the_charge_where_it_belongs(
    formula, atoms, charge
):
    from judge.chemistry_equations import parse_formula

    assert parse_formula(formula) == (atoms, charge)


def test_the_caret_form_is_untouched():
    """The rules only fire when there is no caret, so anything that was
    already unambiguous keeps reading exactly as it did."""
    from judge.chemistry_equations import parse_formula

    assert parse_formula("Cr2O7^2-") == ({"Cr": 2, "O": 7}, -2)
    assert parse_formula("Fe^3+") == ({"Fe": 1}, 3)
    assert parse_formula("e-") == ({}, -1)
