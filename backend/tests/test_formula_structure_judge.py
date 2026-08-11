"""Drawing any structure with the right formula.

The judge that exists because a molecular formula does not determine a
structure. `C2H6O` is ethanol and it is also dimethyl ether, so a student
told to draw a structure with that formula is right either way, and marking
one of them wrong is the failure this product cannot ship with.

The tests worth reading are the ones asserting that two *different* correct
answers both pass. That is the whole reason this is not `ChemistryJudge`.
"""

import pytest

from judge.chemistry import FormulaStructureJudge
from schemas import ChemistryStep


def step(smiles: str, line: int = 1) -> ChemistryStep:
    return ChemistryStep(line_number=line, smiles=smiles)


def verdict(formula: str, smiles: str):
    return FormulaStructureJudge().check(formula, [step(smiles)])[0]


# --------------------------------------------------------------------------
# The point of the whole judge.
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "smiles,what",
    [
        ("CCO", "ethanol"),
        ("COC", "dimethyl ether"),
    ],
)
def test_either_isomer_of_c2h6o_is_accepted(smiles: str, what: str) -> None:
    result = verdict("C2H6O", smiles)

    assert result.valid, f"{what} has the formula C2H6O and must be accepted"
    assert result.judged_by == "deterministic"


@pytest.mark.parametrize(
    "smiles",
    ["CCCC", "CC(C)C"],  # butane and isobutane
)
def test_both_isomers_of_c4h10_are_accepted(smiles: str) -> None:
    assert verdict("C4H10", smiles).valid


@pytest.mark.parametrize(
    "smiles,name",
    [
        ("CCCCCC", "hexane"),
        ("CC(C)CCC", "2-methylpentane"),
        ("CCC(C)CC", "3-methylpentane"),
        ("CC(C)(C)CC", "2,2-dimethylbutane"),
        ("CC(C)C(C)C", "2,3-dimethylbutane"),
    ],
)
def test_all_five_c6h14_isomers_are_accepted(smiles: str, name: str) -> None:
    # The textbook exercise is "draw an isomer of C6H14", and there are five
    # right answers. A judge that knows only one of them fails four students.
    assert verdict("C6H14", smiles).valid, f"{name} is C6H14"


@pytest.mark.parametrize("smiles", ["CC(C)CC", "CC(C)(C)C"])
def test_a_c5h12_isomer_is_not_c6h14(smiles: str) -> None:
    # 2-methylbutane and neopentane are one carbon short. Being loose about
    # which isomer must not mean being loose about which formula.
    assert not verdict("C6H14", smiles).valid


# --------------------------------------------------------------------------
# It is still a judge. Wrong is wrong.
# --------------------------------------------------------------------------
def test_a_different_compound_is_rejected() -> None:
    result = verdict("C2H6O", "CCC")  # propane

    assert not result.valid
    assert result.error_type == "wrong_formula"


def test_one_atom_out_is_rejected() -> None:
    # C2H4O is acetaldehyde, one hydrogen short. A near miss is the case a
    # loose judge is most likely to wave through.
    result = verdict("C2H6O", "CC=O")

    assert not result.valid
    assert result.error_type == "wrong_formula"


def test_the_right_atoms_in_the_wrong_numbers_is_rejected() -> None:
    result = verdict("C2H6O", "CCCCO")

    assert not result.valid
    assert result.error_type == "wrong_formula"


# --------------------------------------------------------------------------
# How the formula is written must not matter.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("formula", ["C2H6O", "H6C2O", "OC2H6"])
def test_element_order_in_the_formula_is_irrelevant(formula: str) -> None:
    # It compares element counts, not the Hill string, because a student
    # writes the formula in whatever order they think of it.
    assert verdict(formula, "CCO").valid


def test_a_parenthesised_formula_is_read(formula: str = "C2(H3)2O") -> None:
    assert verdict(formula, "CCO").valid


# --------------------------------------------------------------------------
# Our limitations are ours, and are never the student's mistake.
# --------------------------------------------------------------------------
def test_an_unreadable_drawing_is_a_parse_error_not_a_wrong_answer() -> None:
    result = verdict("C2H6O", "not a structure")

    assert not result.valid
    assert result.error_type == "parse_error"


def test_an_unreadable_target_formula_reports_on_line_zero() -> None:
    verdicts = FormulaStructureJudge().check("Qz9", [step("CCO")])

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "parse_error"


def test_an_empty_formula_is_refused() -> None:
    verdicts = FormulaStructureJudge().check("", [step("CCO")])

    assert verdicts[0].error_type == "parse_error"


def test_every_step_gets_its_own_verdict() -> None:
    verdicts = FormulaStructureJudge().check(
        "C2H6O",
        [step("CCO", 1), step("CCC", 2), step("COC", 3)],
    )

    assert [v.valid for v in verdicts] == [True, False, True]
    assert [v.line_number for v in verdicts] == [1, 2, 3]
