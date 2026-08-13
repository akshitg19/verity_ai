import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.chemistry_equations import (
    BalanceJudge,
    EquationParseError,
    parse_equation,
    parse_formula,
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
# parse_formula
# --------------------------------------------------------------------------


def test_plain_formula_counts_each_element():
    assert parse_formula("H2O") == ({"H": 2, "O": 1}, 0)


def test_implicit_count_of_one_is_filled_in():
    assert parse_formula("NaCl") == ({"Na": 1, "Cl": 1}, 0)


def test_repeated_element_accumulates():
    assert parse_formula("CH3COOH") == ({"C": 2, "H": 4, "O": 2}, 0)


def test_two_letter_symbols_are_not_split_into_two_elements():
    assert parse_formula("CO") == ({"C": 1, "O": 1}, 0)
    assert parse_formula("Co") == ({"Co": 1}, 0)


def test_nested_parentheses_multiply_the_whole_group():
    assert parse_formula("(NH4)2SO4") == ({"N": 2, "H": 8, "S": 1, "O": 4}, 0)


def test_parenthesised_group_without_a_multiplier_counts_once():
    assert parse_formula("Ca(OH)2") == ({"Ca": 1, "O": 2, "H": 2}, 0)


def test_doubly_nested_parentheses():
    counts, charge = parse_formula("Fe(N(CH3)2)3")

    assert counts == {"Fe": 1, "N": 3, "C": 6, "H": 18}
    assert charge == 0


def test_positive_ion_charge_is_separate_from_the_element_counts():
    assert parse_formula("Fe^3+") == ({"Fe": 1}, 3)


def test_negative_polyatomic_ion_charge():
    assert parse_formula("SO4^2-") == ({"S": 1, "O": 4}, -2)


def test_single_charge_without_a_digit_is_magnitude_one():
    assert parse_formula("NH4^+") == ({"N": 1, "H": 4}, 1)
    assert parse_formula("OH^-") == ({"O": 1, "H": 1}, -1)


def test_charge_without_a_caret_is_still_read():
    assert parse_formula("Ca2+") == ({"Ca": 1}, 2)


def test_electron_is_charge_with_no_atoms():
    assert parse_formula("e-") == ({}, -1)


def test_state_symbols_are_stripped_before_parsing():
    assert parse_formula("H2O(l)") == ({"H": 2, "O": 1}, 0)
    assert parse_formula("NaCl(aq)") == ({"Na": 1, "Cl": 1}, 0)
    assert parse_formula("CO2(g)") == ({"C": 1, "O": 2}, 0)


def test_unknown_element_is_a_parse_error():
    with pytest.raises(EquationParseError, match="unknown element"):
        parse_formula("Xx2O")


def test_unbalanced_parentheses_is_a_parse_error():
    with pytest.raises(EquationParseError, match="unbalanced parentheses"):
        parse_formula("(NH4)2SO4)")


def test_empty_formula_is_a_parse_error():
    with pytest.raises(EquationParseError):
        parse_formula("")


def test_charge_with_no_formula_is_a_parse_error():
    with pytest.raises(EquationParseError):
        parse_formula("^2-")


# --------------------------------------------------------------------------
# parse_equation
# --------------------------------------------------------------------------


def test_combustion_equation_splits_into_two_sides():
    left, right = parse_equation("2H2 + O2 -> 2H2O")

    assert left == [(2, "H2"), (1, "O2")]
    assert right == [(2, "H2O")]


def test_missing_coefficient_defaults_to_one():
    left, right = parse_equation("CH4 + 2O2 -> CO2 + 2H2O")

    assert left == [(1, "CH4"), (2, "O2")]
    assert right == [(1, "CO2"), (2, "H2O")]


def test_equals_sign_is_accepted_as_a_separator():
    left, right = parse_equation("2H2 + O2 = 2H2O")

    assert left == [(2, "H2"), (1, "O2")]
    assert right == [(2, "H2O")]


def test_unicode_arrow_is_accepted_as_a_separator():
    left, right = parse_equation("2H2 + O2 → 2H2O")

    assert right == [(2, "H2O")]


def test_equation_without_spaces_is_accepted():
    left, right = parse_equation("2H2+O2->2H2O")

    assert left == [(2, "H2"), (1, "O2")]
    assert right == [(2, "H2O")]


def test_redox_half_reaction_keeps_electrons_as_a_term():
    left, right = parse_equation("Fe^3+ + e- -> Fe^2+")

    assert left == [(1, "Fe^3+"), (1, "e-")]
    assert right == [(1, "Fe^2+")]


def test_charge_sign_is_not_mistaken_for_a_term_separator():
    """The first "+" in "Fe^3+ + e-" belongs to the ion, the second splits."""
    left, _ = parse_equation("MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O")

    assert left == [(1, "MnO4^-"), (8, "H^+"), (5, "e-")]


def test_state_symbols_are_stripped_from_a_full_equation():
    left, right = parse_equation("2H2(g) + O2(g) -> 2H2O(l)")

    assert left == [(2, "H2"), (1, "O2")]
    assert right == [(2, "H2O")]


def test_equation_without_a_separator_is_a_parse_error():
    with pytest.raises(EquationParseError, match="separator"):
        parse_equation("2H2 + O2 2H2O")


def test_equation_with_two_separators_is_a_parse_error():
    with pytest.raises(EquationParseError, match="more than one separator"):
        parse_equation("H2 -> O2 -> H2O")


def test_equation_with_an_empty_side_is_a_parse_error():
    with pytest.raises(EquationParseError, match="missing one of its two sides"):
        parse_equation("2H2 + O2 ->")


def test_equation_with_an_empty_term_is_a_parse_error():
    with pytest.raises(EquationParseError, match="empty term"):
        parse_equation("2H2 +  + O2 -> 2H2O")


def test_coefficient_with_no_formula_is_a_parse_error():
    with pytest.raises(EquationParseError):
        parse_equation("2H2 + 4 -> 2H2O")


# --------------------------------------------------------------------------
# BalanceJudge
# --------------------------------------------------------------------------


def test_correctly_balanced_equation_is_valid():
    verdicts = check("H2 + O2 -> H2O", "2H2 + O2 -> 2H2O")

    assert verdicts[0].valid
    assert verdicts[0].status == "valid"
    assert verdicts[0].error_type is None


def test_balanced_combustion_with_state_symbols_is_valid():
    verdicts = check(
        "CH4 + O2 -> CO2 + H2O",
        "CH4(g) + 2O2(g) -> CO2(g) + 2H2O(l)",
    )

    assert verdicts[0].valid


def test_balanced_equation_with_polyatomic_groups_is_valid():
    verdicts = check(
        "Ca(OH)2 + HCl -> CaCl2 + H2O",
        "Ca(OH)2 + 2HCl -> CaCl2 + 2H2O",
    )

    assert verdicts[0].valid


def test_wrong_coefficients_are_unbalanced_atoms():
    verdicts = check("H2 + O2 -> H2O", "H2 + O2 -> H2O")

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "unbalanced_atoms"
    assert verdicts[0].status == "invalid"


def test_unbalanced_atoms_detail_names_the_offending_element():
    verdicts = check("H2 + O2 -> H2O", "H2 + O2 -> H2O")

    assert "O" in verdicts[0].detail


def test_balanced_redox_half_reaction_is_valid():
    verdicts = check("Fe^3+ + e- -> Fe^2+", "Fe^3+ + e- -> Fe^2+")

    assert verdicts[0].valid


def test_balanced_permanganate_half_reaction_is_valid():
    verdicts = check(
        "MnO4^- + H^+ + e- -> Mn^2+ + H2O",
        "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O",
    )

    assert verdicts[0].valid


def test_half_reaction_with_too_many_electrons_is_unbalanced_charge():
    verdicts = check("Fe^3+ + e- -> Fe^2+", "Fe^3+ + 2e- -> Fe^2+")

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "unbalanced_charge"
    assert verdicts[0].status == "invalid"


def test_half_reaction_with_no_electrons_is_unbalanced_charge():
    verdicts = check("Fe^3+ + e- -> Fe^2+", "Fe^3+ -> Fe^2+")

    assert verdicts[0].error_type == "unbalanced_charge"


def test_atom_mismatch_is_reported_before_charge_mismatch():
    """Atoms are checked first, so a line wrong in both ways reads as
    unbalanced_atoms rather than sending the student after the charge."""
    verdicts = check("Fe^3+ + e- -> Fe^2+", "2Fe^3+ + e- -> Fe^2+")

    assert verdicts[0].error_type == "unbalanced_atoms"


def test_malformed_equation_is_parse_error_not_student_mistake():
    verdicts = check("H2 + O2 -> H2O", "2H2 + O2 2H2O")

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "parse_error"
    assert verdicts[0].status == "parse_error"


def test_unknown_element_in_a_step_is_a_parse_error():
    verdicts = check("H2 + O2 -> H2O", "2H2 + Qz -> 2H2O")

    assert verdicts[0].error_type == "parse_error"


def test_malformed_reference_equation_is_a_problem_error():
    verdicts = check("this is not an equation", "2H2 + O2 -> 2H2O")

    assert len(verdicts) == 1
    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "parse_error"


def test_an_unbalanced_line_does_not_affect_later_lines():
    verdicts = check(
        "H2 + O2 -> H2O",
        "H2 + O2 -> H2O",
        "2H2 + O2 -> 2H2O",
    )

    assert [verdict.valid for verdict in verdicts] == [False, True]


def test_every_step_receives_its_own_verdict():
    verdicts = check(
        "H2 + O2 -> H2O",
        "2H2 + O2 -> 2H2O",
        "H2 + O2 -> H2O",
        "not an equation",
    )

    assert [verdict.line_number for verdict in verdicts] == [1, 2, 3]
    assert [verdict.status for verdict in verdicts] == [
        "valid",
        "invalid",
        "parse_error",
    ]


# ---------------------------------------------------------------------------
# Hydrates
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "formula,atoms",
    [
        ("CuSO4.5H2O", {"Cu": 1, "S": 1, "O": 9, "H": 10}),
        ("CuSO4·5H2O", {"Cu": 1, "S": 1, "O": 9, "H": 10}),
        ("CuSO4•5H2O", {"Cu": 1, "S": 1, "O": 9, "H": 10}),
        ("Na2CO3.10H2O", {"Na": 2, "C": 1, "O": 13, "H": 20}),
        ("MgSO4.7H2O", {"Mg": 1, "S": 1, "O": 11, "H": 14}),
        ("CaSO4.2H2O", {"Ca": 1, "S": 1, "O": 6, "H": 4}),
        # No multiplier means one of them.
        ("CuSO4.H2O", {"Cu": 1, "S": 1, "O": 5, "H": 2}),
    ],
)
def test_a_hydrate_adds_its_water(formula, atoms):
    """The dot means "and this many of these too".

    Copper sulfate pentahydrate is on every molar mass sheet and was a
    parse error, so a student could not ask the question and a worked
    example could not use it. The demo script carried "no hydrates" as a
    thing to avoid on stage.
    """
    assert parse_formula(formula) == (atoms, 0)


def test_a_hydrate_has_the_molar_mass_the_book_gives_it():
    from judge.stoichiometry import StoichiometryProblem, solve_stoichiometry

    solution = solve_stoichiometry(
        StoichiometryProblem(task="molar_mass", formula="CuSO4.5H2O")
    )

    assert round(solution.answer.quantity.value, 2) == 249.68


def test_an_ordinary_formula_is_unaffected():
    assert parse_formula("Al2(SO4)3") == ({"Al": 2, "S": 3, "O": 12}, 0)
    assert parse_formula("H2O") == ({"H": 2, "O": 1}, 0)


def test_a_dot_with_nothing_after_it_is_still_an_error():
    """The relaxation is about hydrates, not about accepting anything with a
    dot in it."""
    with pytest.raises(EquationParseError):
        parse_formula("CuSO4.5")


# ---------------------------------------------------------------------------
# A charge sign is not a plus sign
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "equation,left,right",
    [
        # How a student writes it, and how the model writes it.
        ("Ag+ + Cl- -> AgCl", [(1, "Ag+"), (1, "Cl-")], [(1, "AgCl")]),
        (
            "NH4+ + OH- -> NH3 + H2O",
            [(1, "NH4+"), (1, "OH-")],
            [(1, "NH3"), (1, "H2O")],
        ),
        (
            "MnO4- + 8H+ + 5e- -> Mn2+ + 4H2O",
            [(1, "MnO4-"), (8, "H+"), (5, "e-")],
            [(1, "Mn2+"), (4, "H2O")],
        ),
        # With state symbols hanging off the charge.
        (
            "3Ag+(aq) + PO4^3-(aq) -> Ag3PO4(s)",
            [(3, "Ag+"), (1, "PO4^3-")],
            [(1, "Ag3PO4")],
        ),
        (
            "Pb2+(aq) + 2I-(aq) -> PbI2(s)",
            [(1, "Pb2+"), (2, "I-")],
            [(1, "PbI2")],
        ),
    ],
)
def test_a_charge_written_without_a_caret_stays_with_its_ion(equation, left, right):
    """"Ag+ + Cl- -> AgCl" split into "Ag" and "(aq)" and came back as "has
    an empty term", because a "+" only counted as a charge after a caret.
    Nobody writes the caret on paper. Live, it threw away four correct net
    ionic worked examples, and it would have done the same to a student."""
    assert parse_equation(equation) == (left, right)


@pytest.mark.parametrize(
    "equation",
    [
        "2H2+O2->2H2O",       # no spaces anywhere, still two reactants
        "2H2 + O2 -> 2H2O",
        "Fe^3+ + e- -> Fe^2+",  # the caret form, untouched
    ],
)
def test_a_separator_is_still_a_separator(equation):
    left, _ = parse_equation(equation)

    assert len(left) == 2, "the plus between two formulas still splits them"
