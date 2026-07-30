import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge import ChemistryJudge
from schemas import ChemistryStep


judge = ChemistryJudge()


def check(target: str, *smiles: str):
    steps = [
        ChemistryStep(line_number=index + 1, smiles=value)
        for index, value in enumerate(smiles)
    ]
    return judge.check(target, steps)


def test_equivalent_alternative_smiles_are_valid():
    verdicts = check("CCO", "OCC")

    assert verdicts[0].valid
    assert verdicts[0].status == "valid"


def test_equivalent_aromatic_smiles_are_valid():
    verdicts = check("c1ccccc1", "C1=CC=CC=C1")

    assert verdicts[0].valid


def test_different_supported_structure_is_invalid():
    verdicts = check("CCO", "CC")

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "structure_mismatch"
    assert verdicts[0].status == "invalid"


def test_same_formula_with_different_connectivity_is_invalid():
    verdicts = check("CCO", "COC")

    assert verdicts[0].error_type == "structure_mismatch"


def test_invalid_candidate_does_not_change_later_target_comparison():
    verdicts = check("CCO", "CC", "OCC")

    assert [verdict.valid for verdict in verdicts] == [False, True]
    assert verdicts[0].error_type == "structure_mismatch"


def test_malformed_candidate_is_parse_error_not_student_mistake():
    verdicts = check("CCO", "C1CC")

    assert not verdicts[0].valid
    assert verdicts[0].error_type == "parse_error"
    assert verdicts[0].status == "parse_error"


def test_malformed_target_is_problem_parse_error():
    verdicts = check("C1CC", "CCO")

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "parse_error"


def test_disconnected_candidate_is_unsupported():
    verdicts = check("CCO", "CCO.Cl")

    assert verdicts[0].error_type == "unsupported"
    assert verdicts[0].status == "unsupported"


def test_metal_target_is_unsupported():
    verdicts = check("[Na]OC", "CO[Na]")

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "unsupported"


def test_atom_mapped_candidate_is_unsupported():
    verdicts = check("CCO", "[CH3:1][CH2:2][OH:3]")

    assert verdicts[0].error_type == "unsupported"


def test_isotope_candidate_is_unsupported():
    verdicts = check("CCO", "[13CH3]CO")

    assert verdicts[0].error_type == "unsupported"


def test_reaction_smiles_is_unsupported_not_parse_error():
    verdicts = check("CCO", "CCO>>CC=O")

    assert verdicts[0].error_type == "unsupported"


def test_formal_charge_is_part_of_structure_equivalence():
    verdicts = check("C[N+](C)(C)C", "CN(C)C")

    assert verdicts[0].error_type == "structure_mismatch"


def test_opposite_stereochemistry_is_invalid():
    verdicts = check("F[C@H](Cl)Br", "F[C@@H](Cl)Br")

    assert verdicts[0].error_type == "structure_mismatch"
