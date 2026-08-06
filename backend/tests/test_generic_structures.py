"""The Aug 4 failure, and its family.

A student drew the general ester R-C(=O)-O-R', Gemini read it correctly as
`O=C(R)OR`, and the app said "Could not check" because RDKit has no atom
called R. Recognition was never the bottleneck; representation was.

These tests are the before/after for that case class. Every one of them
fails against the version of `judge/chemistry.py` that rejected wildcards.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from judge.chemistry import (
    ChemistryJudge,
    ChemistryParseError,
    FunctionalGroupJudge,
    IsomerJudge,
    canonical_smiles,
    is_generic,
    molecular_formula,
    normalise_generic_smiles,
    render_svg,
    _parse_smiles,
)
from schemas import ChemistryStep


structure_judge = ChemistryJudge()
group_judge = FunctionalGroupJudge()


def group_status(target: str, smiles: str) -> str:
    return group_judge.check(
        target, [ChemistryStep(line_number=1, smiles=smiles)]
    )[0].status


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "written,expected",
    [
        ("O=C(R)OR'", "O=C(*)O*"),
        ("R1OC(=O)R2", "*OC(=O)*"),
        ("ArC(=O)OR", "*C(=O)O*"),
        ("XCC", "*CC"),
        ("CCO", "CCO"),
    ],
)
def test_r_groups_normalise_to_wildcards(written, expected):
    assert normalise_generic_smiles(written)[0] == expected


@pytest.mark.parametrize("smiles", ["CCBr", "CC(Cl)Br", "[Rb+]", "CCRu"])
def test_element_symbols_starting_with_r_are_untouched(smiles):
    """Rb, Ru, and Br must survive; only a bare uppercase R is a group."""
    assert normalise_generic_smiles(smiles)[1] is False


def test_two_drawings_of_the_same_generic_ester_compare_equal():
    assert canonical_smiles("O=C(R)OR'") == canonical_smiles("*C(=O)O*")


def test_the_aug_4_case_is_now_judged_rather_than_refused():
    verdicts = structure_judge.check(
        "O=C(R)OR'", [ChemistryStep(line_number=1, smiles="*C(=O)O*")]
    )

    assert verdicts[0].status == "valid"


def test_a_generic_structure_is_marked_as_generic():
    assert is_generic(_parse_smiles("O=C(R)OR'")) is True
    assert is_generic(_parse_smiles("CC(=O)OC")) is False


# ---------------------------------------------------------------------------
# Generic-aware functional groups
# ---------------------------------------------------------------------------


def test_a_generic_ester_matches_the_ester_pattern():
    assert group_status("ester", "O=C(R)OR'") == "valid"


def test_a_concrete_ester_still_matches():
    assert group_status("ester", "CC(=O)OC") == "valid"


def test_a_generic_ether_is_not_an_ester():
    """The exclusions have to survive the widening, or the whole
    functional-group judge becomes a rubber stamp."""
    assert group_status("ester", "ROR'") == "invalid"


def test_a_generic_ester_is_not_an_ether():
    assert group_status("ether", "O=C(R)OR'") == "invalid"


def test_a_generic_ether_matches_the_ether_pattern():
    assert group_status("ether", "ROR'") == "valid"


def test_a_generic_amide_is_not_an_amine():
    assert group_status("amine", "RC(=O)NR'") == "invalid"
    assert group_status("amide", "RC(=O)NR'") == "valid"


def test_a_concrete_ether_is_still_not_an_ester():
    assert group_status("ester", "CCOCC") == "invalid"


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def test_a_structure_renders_to_svg():
    svg = render_svg("CC(=O)OC")

    assert "<svg" in svg
    assert len(svg) > 500


def test_a_generic_structure_renders_too():
    """This is the whole usability argument: a student cannot verify
    `O=C(*)O*` and can verify a picture instantly."""
    assert "<svg" in render_svg("O=C(R)OR'")


def test_rendering_an_unparseable_structure_raises_rather_than_returning_junk():
    with pytest.raises(ChemistryParseError):
        render_svg("C1CC(")


def test_molecular_formula_shows_the_wildcards():
    assert "*" in molecular_formula("O=C(R)OR'")


# ---------------------------------------------------------------------------
# Isomers
# ---------------------------------------------------------------------------


def isomer_status(reference: str, smiles: str, kind: str = "constitutional") -> str:
    return IsomerJudge(kind).check(
        reference, [ChemistryStep(line_number=1, smiles=smiles)]
    )[0].status


def test_a_constitutional_isomer_is_accepted():
    assert isomer_status("CCO", "COC") == "valid"


def test_the_same_molecule_redrawn_is_not_an_isomer():
    assert isomer_status("CCO", "OCC") == "invalid"


def test_a_different_formula_is_not_an_isomer():
    assert isomer_status("CCO", "CCC") == "invalid"


def test_a_stereoisomer_is_not_a_constitutional_isomer():
    assert isomer_status("C/C=C/C", "C/C=C\\C") == "invalid"


def test_a_stereoisomer_is_accepted_when_that_is_what_was_asked():
    assert isomer_status("C/C=C/C", "C/C=C\\C", kind="stereo") == "valid"


def test_either_kind_counts_when_the_problem_says_any():
    assert isomer_status("CCO", "COC", kind="any") == "valid"


def test_a_wrong_formula_reports_the_formula_category():
    verdicts = IsomerJudge("constitutional").check(
        "CCO", [ChemistryStep(line_number=1, smiles="CCC")]
    )

    assert verdicts[0].error_type == "wrong_formula"
