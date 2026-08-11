"""The five hand-written balancing questions, locked as deterministic tests.

These mirror `testing/chemistry/equations-and-balancing.md` line for line. The
markdown sheet is what a person follows while writing on a tablet; this file is
the same five questions with the handwriting step removed, so a regression in
the judge fails in CI instead of being discovered mid-demo.

Two of the five are probes rather than pass/fail checks: they describe what the
judge does today where a teacher would want something else. Those are marked
xfail against the behaviour we want, so the day someone fixes them the test
turns green and says so.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.chemistry_equations import (
    BalanceJudge,
    balanced_equation,
    coefficient_distance,
)
from schemas import ChemistryEquationStep


judge = BalanceJudge()


def check(reference: str, *equations: str):
    steps = [
        ChemistryEquationStep(line_number=index + 1, equation=value)
        for index, value in enumerate(equations)
    ]
    return judge.check(reference, steps)


# --------------------------------------------------------------------------
# Q1. Combustion of propane. One coefficient dropped, one element off.
# --------------------------------------------------------------------------

Q1 = "C3H8 + O2 -> CO2 + H2O"


def test_q1_reference_solves_to_the_textbook_answer():
    assert balanced_equation(Q1) == "C3H8 + 5O2 -> 3CO2 + 4H2O"


def test_q1_dropped_water_coefficient_names_only_the_elements_that_differ():
    first, second = check(Q1, "C3H8 + 5O2 -> 3CO2 + 3H2O", "C3H8 + 5O2 -> 3CO2 + 4H2O")

    assert first.valid is False
    assert first.error_type == "unbalanced_atoms"
    # H and O, not C: the line is right about carbon and the message must say so.
    assert first.detail == "Atom counts differ for: H, O"
    assert second.valid is True


def test_q1_wrong_line_does_not_poison_the_line_after_it():
    verdicts = check(
        Q1,
        "C3H8 + O2 -> 3CO2 + H2O",
        "C3H8 + 5O2 -> 3CO2 + 3H2O",
        "C3H8 + 5O2 -> 3CO2 + 4H2O",
    )

    assert [verdict.valid for verdict in verdicts] == [False, False, True]


# --------------------------------------------------------------------------
# Q2. Polyatomic ions in parentheses. The coefficient is not distributed.
# --------------------------------------------------------------------------

Q2 = "Ca(NO3)2 + Na3PO4 -> Ca3(PO4)2 + NaNO3"


def test_q2_reference_solves_through_the_parentheses():
    assert (
        balanced_equation(Q2)
        == "3Ca(NO3)2 + 2Na3PO4 -> Ca3(PO4)2 + 6NaNO3"
    )


def test_q2_undistributed_coefficient_reports_every_element_it_broke():
    verdict, = check(Q2, "3Ca(NO3)2 + 2Na3PO4 -> Ca3(PO4)2 + 3NaNO3")

    assert verdict.valid is False
    assert verdict.error_type == "unbalanced_atoms"
    assert verdict.detail == "Atom counts differ for: N, Na, O"


def test_q2_one_coefficient_from_the_answer_is_the_terminal_step():
    assert coefficient_distance("3Ca(NO3)2 + 2Na3PO4 -> Ca3(PO4)2 + 3NaNO3") == 1


# --------------------------------------------------------------------------
# Q3. Permanganate half-reaction. Atoms balance, charge does not.
# --------------------------------------------------------------------------

Q3 = "MnO4^- + H^+ + e- -> Mn^2+ + H2O"


def test_q3_wrong_electron_count_is_a_charge_error_not_an_atom_error():
    verdict, = check(Q3, "MnO4^- + 8H^+ + 3e- -> Mn^2+ + 4H2O")

    # Every atom is accounted for. Only the electrons are wrong, and calling
    # this an atom error would send the student to check the oxygens.
    assert verdict.error_type == "unbalanced_charge"
    assert verdict.detail == "Net charge differs: 4 on the left, 2 on the right"


def test_q3_correct_half_reaction_balances_on_atoms_and_charge():
    verdict, = check(Q3, "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O")

    assert verdict.valid is True


# --------------------------------------------------------------------------
# Q4. Subscript changed instead of a coefficient.
#
# The student answers "H2 + O2 -> H2O2", which balances perfectly and is not
# the reaction that was asked. The judge is given the reference equation but
# only parses it to check the problem is well formed, so nothing compares the
# species on the student's line against the species in the question.
# --------------------------------------------------------------------------

Q4 = "H2 + O2 -> H2O"


def test_q4_invented_product_balances_as_arithmetic():
    verdict, = check(Q4, "H2 + O2 -> H2O2")

    assert verdict.valid is True  # today's behaviour, documented not endorsed


@pytest.mark.xfail(
    reason="the judge never compares the student's species against the "
    "reference equation, so changing a subscript passes as balanced",
    strict=True,
)
def test_q4_changing_a_subscript_should_not_be_accepted():
    verdict, = check(Q4, "H2 + O2 -> H2O2")

    assert verdict.valid is False


# --------------------------------------------------------------------------
# Q5. Fractional coefficient, then doubled. A real method, not a mistake.
# --------------------------------------------------------------------------

Q5 = "C2H6 + O2 -> CO2 + H2O"


def test_q5_half_coefficient_line_is_a_parse_error_not_a_wrong_answer():
    verdict, = check(Q5, "C2H6 + 3.5O2 -> 2CO2 + 3H2O")

    # This matters for the UI more than for the judge: parse_error is our
    # limitation, and rendering it as a student mistake is the bug.
    assert verdict.error_type == "parse_error"


def test_q5_doubling_through_reaches_a_valid_line():
    verdict, = check(Q5, "2C2H6 + 7O2 -> 4CO2 + 6H2O")

    assert verdict.valid is True


@pytest.mark.xfail(
    reason="a fractional coefficient is how combustion is taught; the parser "
    "should read 3.5 or 7/2 rather than refuse the line",
    strict=True,
)
def test_q5_fractional_coefficient_should_be_readable():
    verdict, = check(Q5, "C2H6 + 3.5O2 -> 2CO2 + 3H2O")

    assert verdict.valid is True


# --------------------------------------------------------------------------
# Cross-cutting: what a balanced-but-untidy answer does.
# --------------------------------------------------------------------------


def test_a_balanced_multiple_of_the_answer_is_accepted():
    verdict, = check(Q1, "4C3H8 + 20O2 -> 12CO2 + 16H2O")

    assert verdict.valid is True
    # Reduced before comparing, so this is zero coefficients away from the
    # answer rather than four. A teacher still wants lowest whole numbers.
    assert coefficient_distance("4C3H8 + 20O2 -> 12CO2 + 16H2O") == 0


def test_an_all_caps_element_from_transcription_is_a_parse_error():
    verdict, = check("Al + O2 -> Al2O3", "4AL + 3O2 -> 2AL2O3")

    assert verdict.error_type == "parse_error"
    assert "AL" in verdict.detail


def test_a_unicode_arrow_is_read_as_a_separator():
    verdict, = check("Mg + O2 -> MgO", "2Mg + O2 → 2MgO")

    assert verdict.valid is True
