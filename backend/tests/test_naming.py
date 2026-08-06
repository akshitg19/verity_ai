"""IUPAC naming, gated on OPSIN.

The gating is as much under test as the naming: a machine without Java must
report `unsupported` -- our limitation, stated plainly -- and must never
tell a student their name was wrong when in fact we could not check it.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from unittest.mock import patch

import pytest

from judge.naming import (
    NameParseError,
    NamingJudge,
    OpsinUnavailableError,
    looks_like_a_name,
    name_to_smiles,
    opsin_available,
)
from schemas import ChemistryStep


requires_opsin = pytest.mark.skipif(
    not opsin_available(), reason="OPSIN or its Java runtime is unavailable"
)


def check(target_smiles, *lines, target_name=None):
    steps = [
        ChemistryStep(line_number=index + 1, smiles=value)
        for index, value in enumerate(lines)
    ]
    return NamingJudge(target_name).check(target_smiles, steps)


# ---------------------------------------------------------------------------
# Telling a name from a SMILES without asking OPSIN about every line
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text", ["ethanol", "propan-2-ol", "2-methylbutane", "ethanoic acid"]
)
def test_a_name_looks_like_a_name(text):
    assert looks_like_a_name(text) is True


@pytest.mark.parametrize("text", ["CCO", "CC(=O)OC", "c1ccccc1", "C/C=C/C"])
def test_a_smiles_does_not_look_like_a_name(text):
    assert looks_like_a_name(text) is False


# ---------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------


@patch("judge.naming._opsin", side_effect=OpsinUnavailableError("no java"))
def test_a_machine_without_opsin_reports_unsupported(_mock_opsin):
    verdicts = check("CCO", "ethanol")

    assert verdicts[0].status == "unsupported"
    assert verdicts[0].error_type == "unsupported"


@patch("judge.naming._opsin", side_effect=OpsinUnavailableError("no java"))
def test_a_machine_without_opsin_never_says_the_student_is_wrong(_mock_opsin):
    verdicts = check("CCO", "methanol")

    assert verdicts[0].error_type != "wrong_name"


def test_an_empty_name_is_refused_before_opsin_is_consulted():
    with pytest.raises(NameParseError):
        name_to_smiles("   ")


def test_a_smiles_shaped_string_is_not_sent_as_a_name():
    with pytest.raises(NameParseError, match="does not look like"):
        name_to_smiles("CC(=O)[O-]")


# ---------------------------------------------------------------------------
# With OPSIN present
# ---------------------------------------------------------------------------


@requires_opsin
def test_a_correct_name_is_accepted():
    assert check("CCO", "ethanol")[0].status == "valid"


@requires_opsin
def test_a_name_for_a_different_structure_is_flagged():
    verdicts = check("CCO", "methanol")

    assert verdicts[0].status == "invalid"
    assert verdicts[0].error_type == "wrong_name"


@requires_opsin
def test_an_unparseable_name_is_a_parse_error_not_a_wrong_answer():
    """OPSIN failing to read a name is not proof that the name is wrong."""
    verdicts = check("CCO", "ethanoll")

    assert verdicts[0].status == "parse_error"


@requires_opsin
def test_the_problem_may_be_stated_as_a_name_and_answered_with_a_drawing():
    verdicts = check(None, "CCO", target_name="ethanol")

    assert verdicts[0].status == "valid"


@requires_opsin
def test_a_drawn_answer_to_a_named_problem_can_be_wrong():
    verdicts = check(None, "CCC", target_name="ethanol")

    assert verdicts[0].error_type == "wrong_name"


@requires_opsin
@pytest.mark.parametrize(
    "name,smiles",
    [
        ("propan-2-ol", "CC(O)C"),
        ("ethanoic acid", "CC(=O)O"),
        ("methyl ethanoate", "CC(=O)OC"),
        ("2-methylbutane", "CCC(C)C"),
        ("benzene", "c1ccccc1"),
    ],
)
def test_a_range_of_names_resolve_to_the_right_structures(name, smiles):
    assert check(smiles, name)[0].status == "valid"


@requires_opsin
def test_a_naming_problem_with_no_target_reports_line_zero():
    verdicts = check(None, "ethanol")

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "unsupported"
