import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge import FunctionalGroupJudge
from judge.chemistry import FUNCTIONAL_GROUP_SMARTS
from schemas import ChemistryStep


judge = FunctionalGroupJudge()


def check(target_group: str, *smiles: str):
    steps = [
        ChemistryStep(line_number=index + 1, smiles=value)
        for index, value in enumerate(smiles)
    ]
    return judge.check(target_group, steps)


# One molecule that genuinely contains each group, and one that contains a
# different group instead. The confusable pairs are deliberate: an ester and
# an ether both have a two-carbon oxygen, an aldehyde and a ketone share a
# carbonyl, and an amide nitrogen is still trivalent.
CORRECT_MOLECULES = {
    "ester": "CC(=O)OC",          # methyl acetate
    "ether": "CCOCC",             # diethyl ether
    "alcohol": "CCO",             # ethanol
    "ketone": "CC(=O)C",          # acetone
    "aldehyde": "CC=O",           # acetaldehyde
    "carboxylic_acid": "CC(=O)O",  # acetic acid
    "amine": "CCN",               # ethylamine
    "amide": "CC(=O)N",           # acetamide
    # The hydrocarbon families and the rest of a first-year sheet, added
    # after the live audit rejected three worked examples for naming a group
    # we had no pattern for.
    "alkene": "CC=C",             # propene
    "alkyne": "CC#C",             # propyne
    "arene": "c1ccccc1",          # benzene
    "phenol": "Oc1ccccc1",        # phenol
    "nitrile": "CC#N",            # acetonitrile
    "thiol": "CCS",               # ethanethiol
    "alkyl_halide": "CCBr",       # bromoethane
    "nitro": "C[N+](=O)[O-]",     # nitromethane
}
WRONG_GROUP_MOLECULES = {
    "ester": "CCO",               # an alcohol, not an ester
    "ether": "CCO",               # an alcohol, not an ether
    "alcohol": "CCOCC",           # an ether, not an alcohol
    "ketone": "CC=O",             # an aldehyde, not a ketone
    "aldehyde": "CC(=O)C",        # a ketone, not an aldehyde
    "carboxylic_acid": "CC(=O)OC",  # an ester, not an acid
    "amine": "CC(=O)N",           # an amide, not a free amine
    "amide": "CCN",               # an amine, not an amide
    "alkene": "CC#C",             # an alkyne, not an alkene
    "alkyne": "CC=C",             # an alkene, not an alkyne
    "arene": "C1CCCCC1",          # cyclohexane, saturated and not aromatic
    "phenol": "CCO",              # an alcohol on a carbon, not on a ring
    "nitrile": "CC(=O)N",         # an amide, not a nitrile
    "thiol": "CCO",               # an alcohol, not a thiol
    "alkyl_halide": "CCO",        # an alcohol, no halogen at all
    "nitro": "CCN",               # an amine, not a nitro group
}


def test_every_supported_group_has_test_coverage():
    assert set(CORRECT_MOLECULES) == set(FUNCTIONAL_GROUP_SMARTS)
    assert set(WRONG_GROUP_MOLECULES) == set(FUNCTIONAL_GROUP_SMARTS)


@pytest.mark.parametrize("group,smiles", sorted(CORRECT_MOLECULES.items()))
def test_molecule_containing_the_target_group_is_valid(group, smiles):
    verdicts = check(group, smiles)

    assert verdicts[0].valid
    assert verdicts[0].status == "valid"
    assert verdicts[0].error_type is None


@pytest.mark.parametrize("group,smiles", sorted(WRONG_GROUP_MOLECULES.items()))
def test_molecule_with_a_different_group_is_wrong_functional_group(group, smiles):
    verdicts = check(group, smiles)

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "wrong_functional_group"
    assert verdicts[0].status == "invalid"


def test_larger_molecule_containing_the_group_still_matches():
    verdicts = check("ester", "CCCCOC(=O)CC")

    assert verdicts[0].valid


def test_ester_does_not_count_as_an_ether():
    """The ester's single-bonded oxygen joins two carbons, so the ether
    pattern only rejects it because it excludes an adjacent carbonyl."""
    verdicts = check("ether", "CC(=O)OC")

    assert verdicts[0].error_type == "wrong_functional_group"


def test_carboxylic_acid_does_not_count_as_an_alcohol():
    verdicts = check("alcohol", "CC(=O)O")

    assert verdicts[0].error_type == "wrong_functional_group"


def test_carboxylic_acid_does_not_count_as_a_ketone():
    verdicts = check("ketone", "CC(=O)O")

    assert verdicts[0].error_type == "wrong_functional_group"


def test_wrong_group_does_not_change_later_line_comparison():
    verdicts = check("alcohol", "CCOCC", "CCO")

    assert [verdict.valid for verdict in verdicts] == [False, True]
    assert verdicts[0].error_type == "wrong_functional_group"


def test_malformed_smiles_is_parse_error_not_student_mistake():
    verdicts = check("alcohol", "C1CC")

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "parse_error"
    assert verdicts[0].status == "parse_error"


def test_blank_smiles_is_rejected_by_the_schema_before_the_judge():
    """A blank line never reaches the judge, so there is no verdict for it."""
    with pytest.raises(ValidationError):
        ChemistryStep(line_number=1, smiles="   ")


def test_disconnected_structure_is_unsupported():
    verdicts = check("alcohol", "CCO.Cl")

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "unsupported"
    assert verdicts[0].status == "unsupported"


def test_metal_structure_is_unsupported():
    verdicts = check("alcohol", "CO[Na]")

    assert verdicts[0].error_type == "unsupported"


def test_reaction_smiles_is_unsupported_not_parse_error():
    verdicts = check("alcohol", "CCO>>CC=O")

    assert verdicts[0].error_type == "unsupported"


def test_unknown_group_name_raises_before_checking_any_step():
    # A name with no pattern behind it, not merely one we had not got round
    # to: "alkene" used to sit here and is a supported group now.
    with pytest.raises(ValueError, match="unknown functional group"):
        check("flubber", "CCO")


@pytest.mark.parametrize(
    "written", ["Alcohol", "ALCOHOL", "carboxylic acid", "carboxylic-acid"]
)
def test_a_group_is_found_however_its_name_is_written(written):
    """Rejecting a group we have a pattern for, over its spelling, is
    measuring typing rather than chemistry. Found live: a level 2 worked
    example said "Alcohol" and was thrown away."""
    from judge.chemistry import canonical_group

    assert canonical_group(written) in FUNCTIONAL_GROUP_SMARTS


@pytest.mark.parametrize(
    "group_name,smiles",
    [
        ("alkene", "C=C"),
        ("alkyne", "C#C"),
        ("arene", "c1ccccc1"),
        ("phenol", "Oc1ccccc1"),
        ("nitrile", "CC#N"),
        ("thiol", "CCS"),
        ("alkyl_halide", "CCBr"),
    ],
)
def test_the_groups_added_for_the_live_audit_match_what_they_name(
    group_name, smiles
):
    """Three level 2 examples were rejected for naming "alkene", which we
    simply had no pattern for. A group in the table has to actually work."""
    assert check(group_name, smiles)[0].valid is True


def test_unknown_group_error_names_the_supported_groups():
    with pytest.raises(ValueError, match="carboxylic_acid"):
        check("", "CCO")
