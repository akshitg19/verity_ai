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
        "stoichiometry", "mass_from_moles",
        {"stoichiometry": {"task": "mass_from_moles", "formula": "NaCl",
                           "moles": 0.25,
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "0.25", "wrong_value",
    ),
    (
        "stoichiometry", "empirical_formula",
        {"stoichiometry": {"task": "empirical_formula",
                           "composition": {"C": 40.0, "H": 6.7, "O": 53.3},
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "CH2O2", "wrong_formula",
    ),
    (
        "stoichiometry", "molecular_formula",
        {"stoichiometry": {"task": "molecular_formula",
                           "composition": {"C": 40.0, "H": 6.7, "O": 53.3},
                           "target_molar_mass": 180.0,
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "CH2O", "wrong_formula",
    ),
    (
        "stoichiometry", "limiting_reagent",
        {"stoichiometry": {"task": "limiting_reagent", "equation": "N2 + H2 -> NH3",
                           "amounts": {"N2": 28.0, "H2": 6.0},
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "N2", "wrong_species",
    ),
    (
        "stoichiometry", "theoretical_yield",
        {"stoichiometry": {"task": "theoretical_yield", "equation": "N2 + H2 -> NH3",
                           "amounts": {"N2": 28.0, "H2": 6.0}, "product": "NH3",
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        "99.9", "wrong_value",
    ),
    (
        "solutions", "molarity",
        {"solutions": {"task": "molarity", "formula": "NaCl", "mass_g": 5.85,
                       "volume_l": 1.0, "steps": [{"line_number": 1, "smiles": "0"}]}},
        "5.85", "wrong_value",
    ),
    (
        "solutions", "dilution",
        {"solutions": {"task": "dilution", "initial_concentration_m": 2.0,
                       "initial_volume_l": 0.05, "final_volume_l": 0.5,
                       "steps": [{"line_number": 1, "smiles": "0"}]}},
        "20.0", "wrong_value",
    ),
    (
        "solutions", "strong_base_ph",
        {"solutions": {"task": "strong_base_ph", "concentration_m": 0.01,
                       "hydroxides": 1, "steps": [{"line_number": 1, "smiles": "0"}]}},
        "2.00", "wrong_value",
    ),
    (
        "solutions", "weak_acid_ph",
        {"solutions": {"task": "weak_acid_ph", "concentration_m": 0.1,
                       "ka": 1.8e-5, "steps": [{"line_number": 1, "smiles": "0"}]}},
        "1.00", "wrong_value",
    ),
    (
        "solutions", "weak_base_ph",
        {"solutions": {"task": "weak_base_ph", "concentration_m": 0.1,
                       "kb": 1.8e-5, "steps": [{"line_number": 1, "smiles": "0"}]}},
        "2.87", "wrong_value",
    ),
    (
        "solutions", "titration_concentration",
        {"solutions": {"task": "titration_concentration",
                       "titrant_concentration_m": 0.1, "titrant_volume_l": 0.025,
                       "analyte_volume_l": 0.02,
                       "steps": [{"line_number": 1, "smiles": "0"}]}},
        "0.100", "wrong_value",
    ),
    (
        "solutions", "percent_by_mass",
        {"solutions": {"task": "percent_by_mass", "solute_mass_g": 5.0,
                       "solution_mass_g": 100.0,
                       "steps": [{"line_number": 1, "smiles": "0"}]}},
        "0.05", "wrong_value",
    ),
    (
        "structure", "match_structure",
        {"target_smiles": "CC(=O)OC"},
        "CCOC", "structure_mismatch",
    ),
    (
        "organic", "draw_from_name",
        {"target_smiles": "CC(O)C"},
        "CCCO", "structure_mismatch",
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


def test_every_concept_has_a_worked_case():
    """No concept ships without at least one question exercised end to end.

    This is the assertion that keeps the coverage above honest as problem
    types are added: writing rules for a new concept without also adding a
    case here fails, rather than quietly leaving it untested.
    """
    missing = sorted(set(CONCEPTS) - {case[1] for case in CASES})
    assert not missing, f"no test question for: {', '.join(missing)}"


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


# ---------------------------------------------------------------------------
# The animations, proven to have something to animate.
#
# The rendering is tested on the frontend. What is tested here is that the
# payload it renders actually arrives: an atom tally needs `equations`, a
# quantity trail needs `quantities`, and a drawn molecule needs `structure`.
# Level 2 is the rung that carries all three, and it only returns anything
# at all once the generated example has passed our own verification, so
# these also prove verification accepts a correct example rather than only
# rejecting wrong ones.
# ---------------------------------------------------------------------------


def generation_of(payload):
    """A model that returns one fixed example, whatever it is asked."""

    def fake_generate_json(messages, **kwargs):
        return payload, 120

    return fake_generate_json


def level_2_example(monkeypatch, topic, session_body, payload, problem_type):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", generation_of(payload))
    session_id = open_session(topic, session_body)
    response = client.post(
        "/hint",
        json={
            "line_number": 1,
            "error_type": "wrong_value",
            "level": 2,
            "subject": "chemistry",
            "topic": topic,
            "problem_type": problem_type,
            "session_id": session_id,
            "problem": f"a {topic} problem",
            "student_line": "0",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_balancing_level_2_carries_the_atom_tally(monkeypatch):
    """The equations the tally counts come from our parser, not the prose."""
    payload = {
        "problem": "Balance Fe + O2 -> Fe2O3",
        "technique": "Balance oxygen first, then the metal",
        "steps": [
            "Start with the unbalanced equation: Fe + O2 -> Fe2O3",
            "Balance oxygen: Fe + 3O2 -> 2Fe2O3",
            "Balance iron: 4Fe + 3O2 -> 2Fe2O3",
        ],
        "check": {
            "unbalanced": "Fe + O2 -> Fe2O3",
            "balanced": "4Fe + 3O2 -> 2Fe2O3",
        },
    }
    data = level_2_example(
        monkeypatch, "balancing",
        {"reference_equation": "C3H8 + O2 -> CO2 + H2O"},
        payload, "balance",
    )
    example = data["worked_example"]
    assert example is not None, data["hint"]
    assert example["verified"] is True
    assert len(example["equations"]) == len(example["steps"])
    # The last step is the balanced one, and the client counts atoms off it.
    assert example["equations"][-1] is not None
    assert "4Fe" in example["equations"][-1]


def test_numeric_level_2_carries_a_quantity_per_step(monkeypatch):
    """The quantity trail needs one entry per step, aligned by index."""
    payload = {
        "problem": "Find the molar mass of KNO3",
        "technique": "Add each element's contribution",
        "steps": [
            "Mass of K: 39.098 g/mol",
            "Mass of N: 14.007 g/mol",
            "Mass of O: 47.997 g/mol",
            "Molar mass of KNO3: 101.102 g/mol",
        ],
        "check": {
            "task": "molar_mass",
            "params": {"formula": "KNO3"},
            "answer": 101.102,
        },
    }
    data = level_2_example(
        monkeypatch, "stoichiometry",
        {"stoichiometry": {"task": "molar_mass", "formula": "Al2(SO4)3",
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        payload, "molar_mass",
    )
    example = data["worked_example"]
    assert example is not None, data["hint"]
    assert len(example["quantities"]) == len(example["steps"])
    assert all(entry is not None for entry in example["quantities"])
    assert example["quantities"][-1]["unit"] == "g/mol"
    # Rendered by the server so the client cannot disagree about rounding.
    assert example["quantities"][0]["text"]


def test_structure_level_2_carries_the_molecule_to_draw(monkeypatch):
    payload = {
        "problem": "Draw a structure with the formula C3H8O",
        "technique": "Three carbons in a chain, then place the oxygen",
        "steps": [
            "Count the carbons: three in a row",
            "Add the oxygen as an alcohol on the end carbon",
            "The structure is propan-1-ol",
        ],
        "check": {"smiles": "CCCO", "group": "alcohol"},
    }
    data = level_2_example(
        monkeypatch, "structure", {"target_formula": "C2H6O"},
        payload, "formula_structure",
    )
    example = data["worked_example"]
    assert example is not None, data["hint"]
    assert example["structure"] == "CCCO"


def test_an_unverified_worked_example_is_labelled_rather_than_dropped(monkeypatch):
    """The Aug 12 call, and what it did not change.

    An example whose arithmetic our engines could not confirm used to be
    dropped whole, which left a link to somebody else's website in its
    place. It renders now, and `verified` stays false all the way to the
    client so the UI can say which kind of example this is. Nothing may set
    that flag except the verification loop.
    """
    payload = {
        "problem": "Find the molar mass of KNO3",
        "technique": "Add each element's contribution",
        "steps": [
            "Mass of K: 39.098 g/mol",
            "Mass of N: 14.007 g/mol",
            "Molar mass of KNO3: 7.000 g/mol",
        ],
        "check": {
            "task": "molar_mass",
            "params": {"formula": "KNO3"},
            "answer": 7.0,
        },
    }
    data = level_2_example(
        monkeypatch, "stoichiometry",
        {"stoichiometry": {"task": "molar_mass", "formula": "Al2(SO4)3",
                           "steps": [{"line_number": 1, "smiles": "0"}]}},
        payload, "molar_mass",
    )
    assert data["worked_example"] is not None
    assert data["worked_example"]["verified"] is False
    assert data["hint"].strip()


def test_prompts_forbid_pointing_by_line_number():
    """A hint has to say where by quoting the work, not by counting rows.

    On a worksheet the student laid the page out themselves, so our row
    index is not the one they see. "Where you wrote minus 2 on the oxygen"
    lands; "line 3" makes them count first.
    """
    for prompt in (
        hints._CHEMISTRY_LEVEL_1_PROMPT,
        hints._MATH_LEVEL_1_PROMPT,
        hints._CHEMISTRY_LEVEL_3_PROMPT,
        hints._CHEMISTRY_LEVEL_3_PROMPT_OPEN,
    ):
        assert "row number" in prompt or "numbering it" in prompt


def test_no_prompt_teaches_the_model_to_use_an_em_dash():
    """The model copies the register it is given."""
    for name in dir(hints):
        if not name.endswith("_PROMPT") and not name.endswith("_PROMPT_OPEN"):
            continue
        value = getattr(hints, name)
        if isinstance(value, str):
            assert "—" not in value, name


# ---------------------------------------------------------------------------
# The level 2 contract has to describe the engine that verifies it
# ---------------------------------------------------------------------------


def test_the_check_contract_names_every_task_the_engine_solves():
    """A task missing from the contract is a task level 2 can never verify.

    `molecular_formula` was missing and both molecular formula questions
    fell back to the static floor in a live run. The model was asked to
    describe its own problem in a vocabulary that had no word for it.
    """
    from hints import _CHEMISTRY_CHECK_CONTRACTS
    from judge.solutions import TASKS as SOLUTIONS_TASKS
    from judge.stoichiometry import TASKS as STOICHIOMETRY_TASKS

    for topic, tasks in (
        ("stoichiometry", STOICHIOMETRY_TASKS),
        ("solutions", SOLUTIONS_TASKS),
    ):
        contract = _CHEMISTRY_CHECK_CONTRACTS[topic]
        for task in tasks:
            assert task in contract, f"{topic} contract omits {task}"


def test_the_check_contract_names_the_inputs_each_task_takes():
    """The flat list of every field was not a description of any one task.

    The solutions contract had no words at all for titrant_concentration_m,
    titrant_volume_l, analyte_volume_l, protons or hydroxides, and once
    those were added it still invited the model to reach for
    `initial_concentration_m` on a weak acid question, because every field
    was offered for every task. It is per task now, built from the same
    table the solver validates against.
    """
    from hints import _CHEMISTRY_CHECK_CONTRACTS
    from judge.solutions import TASK_INPUTS as SOLUTIONS_INPUTS
    from judge.stoichiometry import TASK_INPUTS as STOICHIOMETRY_INPUTS

    for topic, table in (
        ("stoichiometry", STOICHIOMETRY_INPUTS),
        ("solutions", SOLUTIONS_INPUTS),
    ):
        contract = _CHEMISTRY_CHECK_CONTRACTS[topic]
        for task, inputs in table.items():
            assert task in contract, f"{topic} contract omits {task}"
            for name in inputs:
                assert name in contract, f"{topic}:{task} contract omits {name}"


def test_the_structure_contract_shows_what_a_smiles_is_not():
    """The word "SMILES" alone did not carry it: the model wrote
    CC(Cl)CH2Cl, RDKit refused it, and the student got the static floor."""
    from hints import _CHEMISTRY_CHECK_CONTRACTS

    for topic in ("structure", "organic"):
        contract = _CHEMISTRY_CHECK_CONTRACTS[topic]
        assert "CC(Cl)CCl" in contract
        assert "never CH3CH2OH" in contract
        assert "never shown to the student" in contract


# ---------------------------------------------------------------------------
# The floor is not allowed to point by row number either
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "topic,problem_type,body,line,error_type",
    CASES,
    ids=[f"{topic}:{ptype}" for topic, ptype, _, _, _ in CASES],
)
def test_the_chemistry_floor_never_numbers_a_row(
    monkeypatch, topic, problem_type, body, line, error_type
):
    """The static level 1 template said "Look closely at line 3".

    That is right for math, where the working is one line under the last and
    our count is the student's count. On a worksheet the working is laid out
    however they like, in a region we deliberately do not read, so the row we
    would be naming is not the row they see. Found live: every chemistry
    question that fell back to the floor at level 1 pointed at a row number.
    """
    monkeypatch.setattr(hints, "is_configured", lambda: False)
    session_id = open_session(topic, body)

    response = client.post(
        "/hint",
        json={
            "line_number": 3,
            "error_type": error_type,
            "level": 1,
            "subject": "chemistry",
            "topic": topic,
            "problem_type": problem_type,
            "session_id": session_id,
            "problem": f"a {topic} problem",
            "student_line": line,
        },
    )

    assert response.status_code == 200, response.text
    hint = response.json()["hint"]
    assert not hints._points_by_position(hint), hint


def test_math_still_names_the_line_on_the_floor():
    """The change is chemistry only. Math is line by line and always was."""
    from schemas import HintRequest

    text = hints._template_hint(
        HintRequest(line_number=3, error_type="sign", level=1, subject="math")
    )

    assert "line 3" in text
