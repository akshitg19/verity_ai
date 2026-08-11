"""The equation inside a worked-example step, found by our own parser.

This is what makes the level-2 animation always right instead of usually
right. Every generated step is a sentence and then the chemistry, so the
client used to hunt for the equation in prose and sometimes tallied an
English word as an element. Now the server does it with the same parser that
judges the student, and a step it cannot read comes back as None.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hints import _step_equation


def test_finds_the_equation_after_a_sentence():
    assert (
        _step_equation("Balance the oxygens last: C3H8 + 5O2 -> 3CO2 + 4H2O")
        == "C3H8 + 5O2 -> 3CO2 + 4H2O"
    )


def test_finds_an_equation_with_prose_on_both_sides_of_it():
    assert (
        _step_equation("First write the skeleton, Fe + O2 -> Fe2O3, then balance")
        == "Fe + O2 -> Fe2O3"
    )


def test_drops_a_trailing_full_stop():
    assert _step_equation("So the answer is 2H2 + O2 -> 2H2O.") == "2H2 + O2 -> 2H2O"


def test_keeps_charges_and_electrons_together():
    assert (
        _step_equation("MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O")
        == "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O"
    )


def test_keeps_a_polyatomic_group_intact():
    assert (
        _step_equation("Now it balances: 3Ca(NO3)2 + 2Na3PO4 -> Ca3(PO4)2 + 6NaNO3")
        == "3Ca(NO3)2 + 2Na3PO4 -> Ca3(PO4)2 + 6NaNO3"
    )


def test_reads_a_unicode_arrow():
    assert _step_equation("2Mg + O2 → 2MgO") == "2Mg + O2 -> 2MgO"


# The refusals matter more than the successes: a wrong tally beside a worked
# example teaches the wrong thing, so anything uncertain must come back None.


def test_prose_with_no_equation_is_none():
    assert _step_equation("Count the atoms on each side.") is None


def test_prose_with_an_arrow_but_no_formulas_is_none():
    assert _step_equation("Add hydrogen + oxygen together -> water") is None


def test_an_english_word_is_not_an_element():
    assert _step_equation("Balance -> the equation") is None


def test_an_empty_step_is_none():
    assert _step_equation("   ") is None


def test_a_side_that_is_half_prose_is_none():
    # "gas" is not a formula, so the run stops and the side is incomplete
    # rather than silently short by a term.
    assert _step_equation("H2 + oxygen gas -> H2O") is None
