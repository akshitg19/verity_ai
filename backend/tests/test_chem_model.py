"""The model path, and the deterministic checks wrapped around it.

The order under test is the whole safety argument: deterministic first, the
model only for what is genuinely left, and every model verdict labelled.
The model is mocked throughout -- no test in this repo makes a live call.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from unittest.mock import patch

import pytest

from chem_model import (
    REACTION_EXPECTATIONS,
    ReactionJudge,
    deterministic_reaction_check,
    model_reaction_verdict,
)
from model import ModelError
from schemas import ChemistryStep


judge = ReactionJudge()


def check(problem: dict, *smiles: str):
    steps = [
        ChemistryStep(line_number=index + 1, smiles=value)
        for index, value in enumerate(smiles)
    ]
    return judge.check(problem, steps)


# ---------------------------------------------------------------------------
# Settled without the model
# ---------------------------------------------------------------------------


def test_copying_the_starting_material_needs_no_model():
    verdict = deterministic_reaction_check(["CCO"], "OCC", "oxidation_to_acid")

    assert verdict is not None
    assert verdict.valid is False
    assert verdict.judged_by == "deterministic"


def test_an_unparseable_product_is_a_parse_error_not_a_wrong_answer():
    verdict = deterministic_reaction_check(["CCO"], "C1CC(", "hydration")

    assert verdict.error_type == "parse_error"


def test_a_missing_required_group_is_caught_deterministically():
    """Oxidising a secondary alcohol must give a ketone. A product with no
    ketone in it is wrong without asking anyone."""
    verdict = deterministic_reaction_check(
        ["CC(O)C"], "CCC", "oxidation_secondary_alcohol"
    )

    assert verdict.error_type == "wrong_functional_group"
    assert verdict.judged_by == "deterministic"


def test_atom_bookkeeping_catches_a_product_that_gains_nothing():
    verdict = deterministic_reaction_check(["C=C"], "C#C", "hydrogenation")

    assert verdict is not None
    assert verdict.error_type == "wrong_formula"


def test_a_correct_hydrogenation_is_left_to_the_model():
    """Nothing deterministic contradicts it, so the remainder goes to the
    model rather than being rubber-stamped here."""
    assert deterministic_reaction_check(["C=C"], "CC", "hydrogenation") is None


def test_no_reaction_is_accepted_when_that_is_the_question():
    verdict = deterministic_reaction_check(["CCO"], "CCO", "no_reaction")

    assert verdict.valid is True


def test_every_expectation_names_a_group_we_can_actually_test():
    from chem_model import _EXTRA_PATTERNS
    from judge.chemistry import FUNCTIONAL_GROUP_SMARTS

    known = set(FUNCTIONAL_GROUP_SMARTS) | set(_EXTRA_PATTERNS)
    for name, expectation in REACTION_EXPECTATIONS.items():
        required = expectation.get("requires_group")
        assert required is None or required in known, name


# ---------------------------------------------------------------------------
# The model path, mocked
# ---------------------------------------------------------------------------


def agreeing(payload):
    return lambda *args, **kwargs: (payload, 300)


@patch("chem_model.generate_json")
def test_two_agreeing_correct_reads_produce_a_model_labelled_pass(mock_json):
    mock_json.side_effect = agreeing({"verdict": "correct"})

    verdict = model_reaction_verdict(["C=C"], "H2/Pd", "hydrogenation", "CC", 1)

    assert verdict.valid is True
    assert verdict.judged_by == "model"
    assert verdict.needs_confirmation is False


@patch("chem_model.generate_json")
def test_a_model_verdict_is_never_labelled_deterministic(mock_json):
    mock_json.side_effect = agreeing({"verdict": "correct"})

    verdict = model_reaction_verdict(["C=C"], None, None, "CC", 1)

    assert verdict.judged_by != "deterministic"


@patch("chem_model.generate_json")
def test_disagreement_asks_the_student_to_confirm_rather_than_guessing(mock_json):
    """A confident wrong verdict is the failure that ends a classroom
    trial, so two reads that disagree produce no verdict at all."""
    mock_json.side_effect = [
        ({"verdict": "correct"}, 300),
        ({"verdict": "incorrect", "reason_category": "wrong_skeleton"}, 300),
    ]

    verdict = model_reaction_verdict(["C=C"], None, "hydrogenation", "CC", 1)

    assert verdict.needs_confirmation is True
    assert verdict.status == "unsupported"


@patch("chem_model.generate_json")
def test_an_incorrect_verdict_carries_its_category(mock_json):
    mock_json.side_effect = agreeing(
        {
            "verdict": "incorrect",
            "reason_category": "wrong_regiochemistry",
            "detail": "The new bond is on the wrong carbon.",
        }
    )

    verdict = model_reaction_verdict(["CC=C"], "HBr", None, "CCCBr", 1)

    assert verdict.valid is False
    assert verdict.error_type == "structure_mismatch"
    assert "wrong carbon" in verdict.detail


@patch("chem_model.generate_json")
def test_cannot_verify_is_unsupported_not_a_student_mistake(mock_json):
    mock_json.side_effect = agreeing({"verdict": "cannot_verify"})

    verdict = model_reaction_verdict(["C=C"], None, None, "CC", 1)

    assert verdict.status == "unsupported"
    assert verdict.valid is False


@patch("chem_model.generate_json", side_effect=ModelError("offline"))
def test_a_model_outage_degrades_to_unsupported(_mock_json):
    verdict = model_reaction_verdict(["C=C"], None, None, "CC", 1)

    assert verdict.status == "unsupported"
    assert verdict.judged_by == "model"


# ---------------------------------------------------------------------------
# The judge as a whole
# ---------------------------------------------------------------------------


@patch("chem_model.generate_json")
def test_the_deterministic_layer_short_circuits_the_model(mock_json):
    mock_json.side_effect = AssertionError("the model must not be called")

    verdicts = check(
        {"reactants_smiles": ["CC(O)C"], "reaction_type": "oxidation_secondary_alcohol"},
        "CCC",
    )

    assert verdicts[0].judged_by == "deterministic"


@patch("chem_model.generate_json")
def test_line_numbers_survive_the_deterministic_path(mock_json):
    mock_json.side_effect = agreeing({"verdict": "correct"})

    verdicts = check(
        {"reactants_smiles": ["CCO"], "reaction_type": "no_reaction"}, "CCO", "CCO"
    )

    assert [verdict.line_number for verdict in verdicts] == [1, 2]


def test_a_reaction_with_no_starting_material_reports_line_zero():
    verdicts = check({"reactants_smiles": []}, "CCO")

    assert verdicts[0].line_number == 0
    assert verdicts[0].error_type == "unsupported"


def test_the_prompt_forbids_naming_the_correct_product():
    from chem_model import PROMPT_HEADER

    assert "Never state, spell, or hint at the correct product" in PROMPT_HEADER
