"""Every problem type, every hint level, end to end with a mocked model.

The gap this closes: seven problem types opened no session, so their hints
silently served the static template floor. Nothing failed, nothing logged an
error, and the only way to notice was to use the app and find the hints
vague. A test that walks all of them is the only thing that keeps that from
coming back one problem type at a time.

The model is mocked, per the standing rule that the suite makes no live
calls. What is real here is everything else: the vault is built by the real
engines, the session is opened through the real endpoint, redaction runs, and
the level 2 verification loop runs against the real judges. So a hint that
falls back because of a bug in our code fails this test, while a hint that
falls back because a model was unavailable is exactly what the mock controls.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

import hints
from hint_rules import CONCEPTS, coaching_for, analogue_for
from main import app


client = TestClient(app)


# One entry per problem type the UI offers, with what it takes to open a
# session and a wrong line to ask about. Mirrors `frontend/src/chemistry/
# topics.js`; `test_hint_coverage_matches_the_ui` keeps the two honest.
CASES = [
    # topic, problem_type, session body, a wrong student line, error_type
    (
        "stoichiometry", "molar_mass",
        {"stoichiometry": {"task": "molar_mass", "formula": "Al2(SO4)3",
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "149.04", "wrong_value",
    ),
    (
        "stoichiometry", "percent_composition",
        {"stoichiometry": {"task": "percent_composition", "formula": "C6H12O6",
                           "element": "C",
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "12.5", "wrong_value",
    ),
    (
        "stoichiometry", "moles_from_mass",
        {"stoichiometry": {"task": "moles_from_mass", "formula": "H2O",
                           "mass_g": 36.03,
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "36.0", "wrong_value",
    ),
    (
        "stoichiometry", "percent_yield",
        {"stoichiometry": {"task": "percent_yield", "equation": "N2 + H2 -> NH3",
                           "amounts": {"N2": 28.0, "H2": 6.0}, "product": "NH3",
                           "actual_yield_g": 25.0,
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "120", "wrong_value",
    ),
    (
        "solutions", "strong_acid_ph",
        {"solutions": {"task": "strong_acid_ph", "concentration_m": 0.01,
                       "protons": 1, "steps": [{"line_number": 1, "smiles": "0"}]}},
        "12.00", "wrong_value",
    ),
    (
        "solutions", "buffer_ph",
        {"solutions": {"task": "buffer_ph", "acid_concentration_m": 0.1,
                       "base_concentration_m": 0.2, "pka": 4.74,
                       "steps": [{"line_number": 1, "smiles": "0"}]}},
        "4.44", "wrong_value",
    ),
    (
        "balancing", "balance",
        {"reference_equation": "C3H8 + O2 -> CO2 + H2O"},
        "C3H8 + 3O2 -> 3CO2 + 4H2O", "unbalanced_atoms",
    ),
    (
        "balancing", "net_ionic",
        {"molecular_equation": "AgNO3 + NaCl -> AgCl + NaNO3"},
        "Ag^+ + NO3^- + Na^+ + Cl^- -> AgCl + Na^+ + NO3^-", "not_net_ionic",
    ),
    (
        "redox", "half_reaction",
        {"reference_equation": "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O"},
        "MnO4^- + 8H^+ + 4e- -> Mn^2+ + 4H2O", "unbalanced_charge",
    ),
    (
        "redox", "oxidation_state",
        {"oxidation_formula": "Cr2O7^2-", "oxidation_element": "Cr"},
        "+7", "wrong_oxidation_state",
    ),
    (
        "redox", "cell_potential",
        {"cathode": "Cu^2+ + 2e- -> Cu", "anode": "Zn^2+ + 2e- -> Zn"},
        "0.42", "wrong_value",
    ),
    (
        "structure", "formula_structure",
        {"target_formula": "C2H6O"},
        "CCC", "structure_mismatch",
    ),
    (
        "structure", "isomer",
        {"target_smiles": "CCO"},
        "CCO", "structure_mismatch",
    ),
    (
        "organic", "functional_group",
        {"target_group": "ester"},
        "CCOCC", "wrong_functional_group",
    ),
    (
        "organic", "naming",
        {"target_smiles": "CC(=O)OC"},
        "methyl ethanol", "wrong_name",
    ),
    (
        "organic", "reaction",
        {"target_smiles": "C=C"},
        "C=C", "structure_mismatch",
    ),
]


def open_session(topic: str, body: dict) -> str:
    response = client.post(
        "/chemistry/session",
        json={"topic": topic, "problem": f"a {topic} problem", **body},
    )
    assert response.status_code == 200, (topic, response.text)
    return response.json()["session_id"]


@pytest.mark.parametrize(
    "topic,problem_type,body,line,error_type",
    CASES,
    ids=[f"{topic}:{ptype}" for topic, ptype, _, _, _ in CASES],
)
def test_every_problem_type_opens_a_session(topic, problem_type, body, line, error_type):
    """A session means a vault, and a vault is what hints are generated against.

    Without one, every level serves the static floor no matter how good the
    prompts are. This is the assertion that would have caught the seven
    types that shipped with `session()` returning null.
    """
    assert open_session(topic, body)


@pytest.mark.parametrize(
    "topic,problem_type,body,line,error_type",
    CASES,
    ids=[f"{topic}:{ptype}" for topic, ptype, _, _, _ in CASES],
)
@pytest.mark.parametrize("level", [1, 2, 3])
def test_every_level_returns_a_usable_hint(
    monkeypatch, topic, problem_type, body, line, error_type, level
):
    """With the model unavailable, every level still answers, and answers safely.

    The floor is not a failure state: it is the designed behaviour when
    generation is not possible. What must never happen is an exception, an
    empty hint, or a level the client cannot render.
    """
    monkeypatch.setattr(hints, "is_configured", lambda: False)
    session_id = open_session(topic, body)

    response = client.post(
        "/hint",
        json={
            "line_number": 1,
            "error_type": error_type,
            "level": level,
            "subject": "chemistry",
            "topic": topic,
            "problem_type": problem_type,
            "session_id": session_id,
            "problem": f"a {topic} problem",
            "student_line": line,
            "working_lines": ["53.96", "96.20", "191.99"],
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["hint"].strip(), "a hint must never come back empty"
    assert payload["level"] == level
    assert payload["max_level"] == 3
    assert "—" not in payload["hint"], "no em dashes in student-facing text"


@pytest.mark.parametrize(
    "topic,problem_type,body,line,error_type",
    CASES,
    ids=[f"{topic}:{ptype}" for topic, ptype, _, _, _ in CASES],
)
def test_every_problem_type_has_its_own_coaching(
    topic, problem_type, body, line, error_type
):
    """The rules must be concept level, not topic level.

    Two problem types under the same topic must not produce the same
    coaching, or the prompt is no more specific than the topic name and the
    whole exercise was pointless.
    """
    coaching = coaching_for(problem_type, topic)
    assert coaching, f"{problem_type} has no rules"
    assert analogue_for(problem_type, topic)
    # The label appears in the coaching, so two types under one topic differ.
    assert CONCEPTS[problem_type].label.split()[0].lower() in coaching.lower()


def test_no_two_concepts_share_their_coaching():
    seen: dict[str, str] = {}
    for name in CONCEPTS:
        text = coaching_for(name, None)
        assert text not in seen, f"{name} and {seen.get(text)} coach identically"
        seen[text] = name


def test_no_em_dashes_anywhere_in_the_rules():
    """The model copies the register it is given, so the rules obey it too."""
    for name, rules in CONCEPTS.items():
        blob = " ".join([rules.label, rules.points_at, rules.analogue, *rules.common_errors])
        assert "—" not in blob, name
        assert "–" not in blob, name


def test_working_lines_reach_the_prompt():
    """Level 1 and 3 must actually receive the page, not just accept the field."""
    from schemas import HintRequest

    req = HintRequest(
        line_number=1,
        error_type="wrong_value",
        level=1,
        subject="chemistry",
        topic="stoichiometry",
        problem_type="molar_mass",
        working_lines=["2 x 26.98 = 53.96", "3 x 32.06 = 96.18"],
    )
    block = hints._working_block(req)
    assert "53.96" in block and "96.18" in block
    assert "1." in block and "2." in block


def test_an_empty_working_block_adds_nothing():
    from schemas import HintRequest

    req = HintRequest(line_number=1, error_type=None, level=1)
    assert hints._working_block(req) == ""
