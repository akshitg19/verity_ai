import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from judge.quantities import (
    QuantityParseError,
    parse_quantity,
    quantities_match,
    values_match,
)
from judge.quantities import Quantity


# ---------------------------------------------------------------------------
# Reading a written claim
# ---------------------------------------------------------------------------


def test_reads_a_labelled_quantity():
    quantity = parse_quantity("n = 2.50 mol")

    assert quantity.value == pytest.approx(2.5)
    assert quantity.unit == "mol"
    assert quantity.name == "n"
    assert quantity.sig_figs == 3


def test_converts_millilitres_to_litres():
    assert parse_quantity("500 mL").value == pytest.approx(0.5)


def test_converts_milligrams_to_grams():
    assert parse_quantity("250 mg").value == pytest.approx(0.25)


@pytest.mark.parametrize(
    "text",
    ["3.2 x 10^-4 M", "3.2 * 10^-4 M", "3.2e-4 M", "3.2 × 10⁻⁴ M"],
)
def test_reads_scientific_notation_however_it_is_written(text):
    assert parse_quantity(text).value == pytest.approx(3.2e-4)


def test_reads_a_chain_and_takes_the_final_claim():
    """A student writes "n = m/M = 2.5 mol"; the claim is the last part."""
    quantity = parse_quantity("n = m/M = 2.5 mol")

    assert quantity.value == pytest.approx(2.5)
    assert quantity.name == "n"


def test_ph_has_no_unit_but_is_not_dimensionless_by_accident():
    quantity = parse_quantity("pH = 4.74")

    assert quantity.unit is None
    assert quantity.dimension == "log_concentration"
    assert quantity.name == "ph"


def test_molarity_accepts_both_spellings():
    assert parse_quantity("0.125 M").value == pytest.approx(0.125)
    assert parse_quantity("0.125 mol/L").value == pytest.approx(0.125)


def test_rejects_a_line_with_two_numbers():
    """"2.5 mol / 0.5 L" is working, not an answer, and guessing which
    number was meant is exactly the confident-wrong behaviour to avoid."""
    with pytest.raises(QuantityParseError, match="more than one number"):
        parse_quantity("2.5 mol / 0.5 L")


def test_rejects_text_with_no_number():
    with pytest.raises(QuantityParseError, match="no number"):
        parse_quantity("the answer is bigger")


def test_rejects_an_unknown_unit():
    with pytest.raises(QuantityParseError, match="unrecognised unit"):
        parse_quantity("5 furlongs")


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------


def test_accepts_a_rounded_answer_at_the_precision_written():
    assert values_match(18.015, 18.0, sig_figs=3)
    assert values_match(18.015, 18.02, sig_figs=4)


def test_rejects_a_coarse_number_that_sig_figs_alone_would_admit():
    """"20" has one significant figure; half a unit in that place is 5,
    which would accept almost anything. The 5% cap is what stops it."""
    assert not values_match(18.015, 20.0, sig_figs=1)


def test_rejects_a_wrong_answer_at_full_precision():
    assert not values_match(0.125, 0.25, sig_figs=3)


def test_units_of_a_different_dimension_do_not_match():
    expected = Quantity(value=0.125, unit="M", dimension="concentration")
    written = Quantity(value=0.125, unit="mol", dimension="amount", sig_figs=3)

    assert not quantities_match(expected, written)


def test_a_bare_number_matches_any_dimension():
    """A student who omits the unit has still written the right number."""
    expected = Quantity(value=0.125, unit="M", dimension="concentration")
    written = Quantity(value=0.125, sig_figs=3)

    assert quantities_match(expected, written)


# ---------------------------------------------------------------------------
# Precision the student actually wrote
#
# Reported from the page: "when I write a whole number 12, and the answer is
# 12.3, it still says right." Two significant figures gave half a unit in the
# last place of 0.5, and 12.3 sat well inside it. Rounding 12.3 to two
# figures really is 12, so this was not a rounding rule failing; it was a
# rounding rule applied to somebody who never wrote a decimal point.
# ---------------------------------------------------------------------------


def _matches(expected: float, written: str) -> bool:
    quantity = parse_quantity(written)
    return values_match(expected, quantity.value, sig_figs=quantity.sig_figs)


def test_a_whole_number_is_not_a_decimal_answer():
    assert _matches(12.3, "12") is False
    assert _matches(12.3, "12.3") is True


def test_two_figures_no_longer_swallow_the_third():
    # A pH of 2.87 written as 2.9 is a different answer, not a rounding of
    # the one we solved for.
    assert _matches(2.8752770615501357, "2.9") is False
    assert _matches(2.8752770615501357, "2.88") is True


def test_an_exact_answer_written_short_is_still_right():
    # 74 and 74.0 are the same number. Tightening the rounding rule must not
    # start marking a correct answer wrong for the trailing zero it did not
    # write.
    assert _matches(74.0, "74") is True
    assert _matches(0.5, "0.5") is True


def test_rounding_still_works_once_three_figures_are_written():
    assert _matches(33.7917, "33.8") is True
    assert _matches(342.153, "342.15") is True


def test_one_figure_never_reopens_the_door():
    # The case the cap was written for: "20" for 18.02.
    assert _matches(18.015, "20") is False
