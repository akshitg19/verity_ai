"""The chemistry endpoints, as a contract.

Kept separate from `test_api.py` so the algebra contract stays readable and
so a chemistry change never has to touch the math tests.

The theme running through this file is `final_tasks.md`'s reachability
warning: judges that exist but cannot be reached from the UI do not exist
from a student's point of view. Every endpoint here is one the frontend
calls, and the topic table is served rather than duplicated so the two
cannot drift apart again.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main
from judge.naming import opsin_available
from sessions import SESSIONS


client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clean_sessions():
    SESSIONS.clear()
    yield
    SESSIONS.clear()


def steps(*values):
    return [
        {"line_number": index + 1, "smiles": value}
        for index, value in enumerate(values)
    ]


def statuses(response):
    return [verdict["status"] for verdict in response.json()["verdicts"]]


# ---------------------------------------------------------------------------
# The routing table
# ---------------------------------------------------------------------------


def test_the_six_chemistry_topics_are_served():
    body = client.get("/chemistry/topics").json()

    assert [topic["topic"] for topic in body["topics"]] == [
        "stoichiometry",
        "balancing",
        "redox",
        "solutions",
        "structure",
        "organic",
    ]


def test_every_advertised_endpoint_exists():
    """The reachability guarantee: a topic cannot advertise a judge that is
    not actually mounted."""
    routes = {route.path for route in main.app.routes}
    for topic in client.get("/chemistry/topics").json()["topics"]:
        for endpoint in topic["endpoints"]:
            assert endpoint in routes, f"{topic['topic']} advertises {endpoint}"


def test_each_topic_declares_which_engine_decides():
    for topic in client.get("/chemistry/topics").json()["topics"]:
        assert topic["engine"] in ("deterministic", "mixed", "model")


# ---------------------------------------------------------------------------
# Stoichiometry
# ---------------------------------------------------------------------------


def test_molar_mass_endpoint():
    response = client.post(
        "/chemistry/stoichiometry",
        json={"task": "molar_mass", "formula": "H2O", "steps": steps("18.02 g/mol")},
    )

    assert response.status_code == 200
    assert statuses(response) == ["valid"]


def test_percent_yield_endpoint_flags_a_wrong_number():
    response = client.post(
        "/chemistry/stoichiometry",
        json={
            "task": "percent_yield",
            "equation": "N2 + H2 -> NH3",
            "amounts": {"N2": 28.0, "H2": 6.0},
            "product": "NH3",
            "actual_yield_g": 25.0,
            "steps": steps("40 %"),
        },
    )

    assert response.json()["first_wrong_line"] == 1


def test_a_stoichiometry_problem_missing_its_inputs_reports_a_problem_error():
    response = client.post(
        "/chemistry/stoichiometry",
        json={"task": "molar_mass", "steps": steps("18 g/mol")},
    )

    assert response.json()["problem_error"] == "unsupported"
    assert response.json()["verdicts"] == []


def test_a_negative_mass_is_rejected_by_the_schema():
    response = client.post(
        "/chemistry/stoichiometry",
        json={
            "task": "moles_from_mass",
            "formula": "H2O",
            "mass_g": -5,
            "steps": steps("1 mol"),
        },
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Solutions
# ---------------------------------------------------------------------------


def test_weak_acid_ph_endpoint():
    response = client.post(
        "/chemistry/solutions",
        json={
            "task": "weak_acid_ph",
            "concentration_m": 0.1,
            "ka": 1.8e-5,
            "steps": steps("pH = 2.88"),
        },
    )

    assert statuses(response) == ["valid"]


def test_buffer_endpoint_accepts_the_henderson_hasselbalch_answer():
    response = client.post(
        "/chemistry/solutions",
        json={
            "task": "buffer_ph",
            "acid_concentration_m": 0.2,
            "base_concentration_m": 0.1,
            "pka": 4.74,
            "steps": steps("pH = 4.44"),
        },
    )

    assert statuses(response) == ["valid"]


def test_dilution_endpoint():
    response = client.post(
        "/chemistry/solutions",
        json={
            "task": "dilution",
            "initial_concentration_m": 2.0,
            "initial_volume_l": 0.05,
            "final_volume_l": 0.5,
            "steps": steps("0.2 M"),
        },
    )

    assert statuses(response) == ["valid"]


# ---------------------------------------------------------------------------
# Redox
# ---------------------------------------------------------------------------


def test_oxidation_state_endpoint():
    response = client.post(
        "/chemistry/oxidation-state",
        json={"formula": "KMnO4", "element": "Mn", "steps": steps("+7", "+6")},
    )

    assert statuses(response) == ["valid", "invalid"]


def test_cell_potential_endpoint():
    response = client.post(
        "/chemistry/cell-potential",
        json={
            "cathode": "Cu^2+ + 2e- -> Cu",
            "anode": "Zn^2+ + 2e- -> Zn",
            "steps": steps("1.10 V"),
        },
    )

    assert statuses(response) == ["valid"]


# ---------------------------------------------------------------------------
# Balancing and net ionic
# ---------------------------------------------------------------------------


def test_net_ionic_endpoint():
    response = client.post(
        "/chemistry/net-ionic",
        json={
            "molecular_equation": "AgNO3 + NaCl -> AgCl + NaNO3",
            "steps": [{"line_number": 1, "equation": "Ag^+ + Cl^- -> AgCl"}],
        },
    )

    assert statuses(response) == ["valid"]


def test_net_ionic_endpoint_tells_apart_the_complete_ionic_equation():
    response = client.post(
        "/chemistry/net-ionic",
        json={
            "molecular_equation": "AgNO3 + NaCl -> AgCl + NaNO3",
            "steps": [
                {
                    "line_number": 1,
                    "equation": "Ag^+ + NO3^- + Na^+ + Cl^- -> AgCl + Na^+ + NO3^-",
                }
            ],
        },
    )

    assert response.json()["verdicts"][0]["error_type"] == "not_net_ionic"


# ---------------------------------------------------------------------------
# Structure, isomers, and rendering
# ---------------------------------------------------------------------------


def test_the_aug_4_ester_is_now_judged_over_the_api():
    """The one real-world failure we have observed, as an endpoint test."""
    response = client.post(
        "/chemistry/check",
        json={"target_smiles": "O=C(R)OR'", "steps": steps("*C(=O)O*")},
    )

    assert statuses(response) == ["valid"]


def test_a_generic_ester_passes_the_functional_group_endpoint():
    response = client.post(
        "/chemistry/functional-group",
        json={"target_group": "ester", "steps": steps("O=C(R)OR'")},
    )

    assert statuses(response) == ["valid"]


def test_isomer_endpoint():
    response = client.post(
        "/chemistry/isomer",
        json={
            "reference_smiles": "CCO",
            "isomer_type": "constitutional",
            "steps": steps("COC", "CCC"),
        },
    )

    assert statuses(response) == ["valid", "invalid"]


def test_render_endpoint_returns_an_svg_and_a_formula():
    response = client.post("/chemistry/render", json={"smiles": "CC(=O)OC"})

    assert response.status_code == 200
    body = response.json()
    assert "<svg" in body["svg"]
    assert body["formula"] == "C3H6O2"
    assert body["generic"] is False


def test_render_endpoint_marks_a_generic_structure():
    response = client.post("/chemistry/render", json={"smiles": "O=C(R)OR'"})

    assert response.json()["generic"] is True


def test_render_endpoint_rejects_an_unreadable_smiles():
    response = client.post("/chemistry/render", json={"smiles": "C1CC("})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Reactions: the model path, mocked
# ---------------------------------------------------------------------------


@patch("chem_model.generate_json")
def test_a_model_judged_reaction_is_labelled_as_such(mock_json):
    mock_json.side_effect = lambda *a, **k: ({"verdict": "correct"}, 200)

    response = client.post(
        "/chemistry/reaction",
        json={
            "reactants_smiles": ["C=C"],
            "reagent": "H2/Pd",
            "reaction_type": "hydrogenation",
            "steps": steps("CC"),
        },
    )

    verdict = response.json()["verdicts"][0]
    assert verdict["judged_by"] == "model"
    assert verdict["status"] == "valid"


@patch("chem_model.generate_json")
def test_a_deterministically_settled_reaction_is_labelled_deterministic(mock_json):
    mock_json.side_effect = AssertionError("the model must not be called")

    response = client.post(
        "/chemistry/reaction",
        json={
            "reactants_smiles": ["CC(O)C"],
            "reaction_type": "oxidation_secondary_alcohol",
            "steps": steps("CCC"),
        },
    )

    assert response.json()["verdicts"][0]["judged_by"] == "deterministic"


# ---------------------------------------------------------------------------
# Sessions: the vault's front door
# ---------------------------------------------------------------------------


def test_opening_a_session_returns_an_opaque_id_and_a_budget():
    response = client.post(
        "/chemistry/session",
        json={
            "topic": "solutions",
            "problem": "What is the pH of 0.100 M acetic acid? Ka = 1.8 x 10^-5",
            "solutions": {
                "task": "weak_acid_ph",
                "concentration_m": 0.1,
                "ka": 1.8e-5,
                "steps": steps("placeholder"),
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["level_3_remaining"] == 3
    assert len(body["session_id"]) > 16


def test_a_session_response_carries_nothing_from_the_vault():
    response = client.post(
        "/chemistry/session",
        json={
            "topic": "structure",
            "problem": "Draw methyl ethanoate",
            "target_smiles": "CC(=O)OC",
        },
    )
    body = response.json()

    assert set(body) == {"session_id", "topic", "level_3_remaining", "total_steps"}
    assert "CC(=O)OC" not in response.text
    assert "COC(C)=O" not in response.text


def test_an_unsolvable_problem_is_refused_with_an_explanation():
    response = client.post(
        "/chemistry/session",
        json={
            "topic": "structure",
            "problem": "Draw this",
            "target_smiles": "C1CC(",
        },
    )

    assert response.status_code == 422
    assert "hints will be limited" in response.json()["detail"]


def test_a_balancing_session_records_how_long_the_working_is():
    response = client.post(
        "/chemistry/session",
        json={
            "topic": "balancing",
            "problem": "Balance C3H8 + O2 -> CO2 + H2O",
            "reference_equation": "C3H8 + O2 -> CO2 + H2O",
        },
    )

    assert response.json()["total_steps"] >= 1


# ---------------------------------------------------------------------------
# Hints over the wire
# ---------------------------------------------------------------------------


def test_a_chemistry_hint_without_a_session_still_returns_something():
    response = client.post(
        "/hint",
        json={
            "line_number": 1,
            "error_type": "unbalanced_atoms",
            "level": 2,
            "subject": "chemistry",
            "topic": "balancing",
        },
    )

    assert response.status_code == 200
    assert response.json()["hint"]
    assert response.json()["source"] == "fallback"


def test_the_math_hint_contract_is_unchanged():
    response = client.post(
        "/hint", json={"line_number": 3, "error_type": "sign", "level": 2}
    )

    body = response.json()
    assert body["level"] == 2
    assert body["max_level"] == 3
    assert body["worked_example"] is None
    assert "positive/negative signs" in body["hint"]


# ---------------------------------------------------------------------------
# A question given as a name
#
# "Draw propan-2-ol" opened no session at all, and no session means no vault,
# which means the hint ladder serves the static floor however good the model
# is. The name is the question; the structure it names is the answer.
# ---------------------------------------------------------------------------


def test_a_named_compound_opens_a_session():
    if not opsin_available():
        pytest.skip("resolving a name needs a Java runtime")

    response = client.post(
        "/chemistry/session",
        json={
            "topic": "organic",
            "problem": "Draw propan-2-ol",
            "target_name": "propan-2-ol",
        },
    )

    assert response.status_code == 200
    assert len(response.json()["session_id"]) > 16


def test_a_named_compound_session_leaks_no_structure():
    if not opsin_available():
        pytest.skip("resolving a name needs a Java runtime")

    response = client.post(
        "/chemistry/session",
        json={
            "topic": "organic",
            "problem": "Draw propan-2-ol",
            "target_name": "propan-2-ol",
        },
    )

    assert "CC(O)C" not in response.text
    assert "CC(C)O" not in response.text


def test_a_name_nobody_can_resolve_is_refused_rather_than_crashing():
    response = client.post(
        "/chemistry/session",
        json={
            "topic": "organic",
            "problem": "Draw it",
            "target_name": "not a compound at all",
        },
    )

    assert response.status_code == 422


def test_an_isomer_question_can_name_its_reference_molecule():
    if not opsin_available():
        pytest.skip("resolving a name needs a Java runtime")

    response = client.post(
        "/chemistry/isomer",
        json={
            "reference_smiles": "ethanol",
            "isomer_type": "constitutional",
            "steps": steps("COC"),
        },
    )

    assert response.status_code == 200
    assert response.json()["verdicts"][0]["status"] == "valid"


def test_naming_the_reference_does_not_make_the_same_molecule_an_isomer():
    """The rejection path: dimethyl ether is an isomer of ethanol, ethanol is
    not an isomer of itself, and resolving the reference must not blur that."""
    if not opsin_available():
        pytest.skip("resolving a name needs a Java runtime")

    response = client.post(
        "/chemistry/isomer",
        json={
            "reference_smiles": "ethanol",
            "isomer_type": "constitutional",
            "steps": steps("CCO"),
        },
    )

    assert response.json()["verdicts"][0]["status"] == "invalid"


def test_a_question_we_cannot_read_is_our_limit_and_not_a_wrong_answer():
    """Line 0 is the question. The UI is forbidden to render it as a mistake
    in the student's drawing, so this must never come back `invalid` on the
    line they drew."""
    response = client.post(
        "/chemistry/isomer",
        json={
            "reference_smiles": "ethanolic wibble compound",
            "isomer_type": "constitutional",
            "steps": steps("COC"),
        },
    )

    body = response.json()
    assert body["verdicts"] == [] or body["verdicts"][0]["line_number"] == 0
    assert body.get("problem_error") in ("parse_error", "unsupported")
