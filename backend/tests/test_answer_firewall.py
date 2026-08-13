"""The answer firewall: the highest-priority test work in the repo.

Four mechanisms, tested separately because they are meant to fail
independently:

1. The answer vault -- built once, held server-side, never serialised.
2. Outbound redaction -- one chokepoint, deterministic, never fails open.
3. The terminal-step gate -- level 3 declines when the next line is the answer.
4. The escalation budget -- server-side, per problem, not client-supplied.

Plus the adversarial suite, which is the one that matters: every way we
could think of to get an answer out, asserted to be redacted or refused.
Anyone who claims a leak class is impossible should add the test that
proves it here.
"""

import ast
import inspect
import sys
import typing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import BaseModel

import answer_vault
import hints
import redaction
import schemas
from answer_vault import (
    AnswerVault,
    VaultConstructionError,
    build_vault,
    vault_for_balance,
    vault_for_solutions,
    vault_for_stoichiometry,
    vault_for_structure,
    vault_for_algebra,
    build_math_vault,
)
from judge.solutions import SolutionsProblem
from judge.stoichiometry import StoichiometryProblem
from redaction import check_outbound, numbers_differ
from schemas import HintRequest
from sessions import SessionStore


BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture
def ph_vault() -> AnswerVault:
    """0.1 M acetic acid, Ka 1.8e-5. The answer is pH 2.88."""
    return vault_for_solutions(
        "What is the pH of 0.100 M acetic acid? Ka = 1.8 x 10^-5",
        SolutionsProblem(task="weak_acid_ph", concentration_m=0.1, ka=1.8e-5),
    )


@pytest.fixture
def structure_vault() -> AnswerVault:
    return vault_for_structure("Draw methyl ethanoate", "CC(=O)OC")


# ---------------------------------------------------------------------------
# Mechanism 1: the vault
# ---------------------------------------------------------------------------


def test_the_vault_holds_the_solved_answer(ph_vault):
    assert any(abs(value - 2.8753) < 0.01 for value in ph_vault.numeric_answers)


def test_the_vault_holds_canonical_structure_forms(structure_vault):
    assert "COC(C)=O" in structure_vault.structure_forms


def test_the_vault_holds_the_balanced_coefficients():
    vault = vault_for_balance("Balance H2 + O2 -> H2O", "H2 + O2 -> H2O")

    assert any("2H2" in form for form in vault.answer_forms)


def test_the_vault_holds_the_symbolic_answer_for_a_formula_task():
    vault = vault_for_stoichiometry(
        "Find the empirical formula",
        StoichiometryProblem(
            task="empirical_formula", composition={"C": 40.0, "H": 6.7, "O": 53.3}
        ),
    )

    assert "CH2O" in vault.answer_forms


def test_an_unsolvable_problem_yields_no_vault_rather_than_an_empty_one():
    """No vault means the hint path serves the static floor. Generating
    freely against no redaction reference is the leak we are preventing."""
    with pytest.raises(VaultConstructionError):
        build_vault(topic="structure", problem="?", target_smiles="C1CC(")


def test_repr_does_not_spill_the_answer(ph_vault):
    """An accidental f-string in a log line must not print an answer."""
    text = f"{ph_vault!r} {ph_vault}"

    assert "2.87" not in text
    assert "AnswerVault" in text


def test_schemas_does_not_import_the_vault():
    source = (BACKEND / "schemas.py").read_text(encoding="utf-8")

    assert "answer_vault" not in source
    assert "AnswerVault" not in source


def _field_types(annotation) -> list:
    """Flatten a type annotation into the concrete classes it can hold."""
    origin = typing.get_origin(annotation)
    if origin is None:
        return [annotation]
    collected: list = []
    for argument in typing.get_args(annotation):
        collected.extend(_field_types(argument))
    return collected


def test_no_response_model_can_carry_vault_data():
    """Walk every model in schemas.py recursively and assert that no field,
    at any nesting depth, has a type that could hold vault contents."""
    forbidden = {
        answer_vault.AnswerVault,
        typing.Any,
        object,
    }
    models = [
        value
        for _, value in inspect.getmembers(schemas, inspect.isclass)
        if issubclass(value, BaseModel) and value is not BaseModel
    ]
    assert models, "no models found; the walk would pass vacuously"

    for model in models:
        for name, field in model.model_fields.items():
            for candidate in _field_types(field.annotation):
                assert candidate not in forbidden, (
                    f"{model.__name__}.{name} can hold vault data"
                )
                if inspect.isclass(candidate):
                    module = getattr(candidate, "__module__", "")
                    assert not module.startswith(
                        ("answer_vault", "sessions", "judge.")
                    ), f"{model.__name__}.{name} references {module}"


# ---------------------------------------------------------------------------
# Mechanism 2: the chokepoint
# ---------------------------------------------------------------------------


def _function_source(module_path: Path, name: str) -> str:
    tree = ast.parse(module_path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return ast.get_source_segment(
                module_path.read_text(encoding="utf-8"), node
            )
    raise AssertionError(f"{name} not found in {module_path}")


def test_hint_responses_are_constructed_in_exactly_one_place():
    """If a second construction site appears, the guarantee stops being
    auditable by reading one function, so this fails loudly instead."""
    source = (BACKEND / "hints.py").read_text(encoding="utf-8")

    assert source.count("HintResponse(") == 1
    assert "HintResponse(" in _function_source(BACKEND / "hints.py", "_finalise")


def test_redaction_runs_only_inside_the_chokepoint():
    source = (BACKEND / "hints.py").read_text(encoding="utf-8")
    finalise = _function_source(BACKEND / "hints.py", "_finalise")

    assert source.count("redact_or_fallback(") == finalise.count(
        "redact_or_fallback("
    )


def test_main_does_not_build_hint_responses_itself():
    source = (BACKEND / "main.py").read_text(encoding="utf-8")

    assert "HintResponse(" not in source


# ---------------------------------------------------------------------------
# Mechanism 2: redaction, and the adversarial suite
# ---------------------------------------------------------------------------


def test_a_safe_hint_passes(ph_vault):
    allowed, violation = check_outbound(
        "Look at the ICE table again: the x you subtract from the initial "
        "concentration is the same x that appears in the numerator.",
        ph_vault,
    )

    assert allowed is True
    assert violation is None


@pytest.mark.parametrize(
    "text",
    [
        "The answer is 2.88.",
        "pH = 2.88",
        "pH is 2.88",
        "pH -> 2.88",
        "You should get 2.875 for the pH.",
        "so pH ≈ 2.88",
        "pH = 2.8753",
        "the pH comes out at 2.9",  # within tolerance of the answer
        "pH＝2.88",  # fullwidth equals, folded by NFKC
        "pH = 2·8 8",
    ],
)
def test_every_way_of_stating_the_answer_is_rejected(ph_vault, text):
    allowed, violation = check_outbound(text, ph_vault)

    assert allowed is False, f"{text!r} was allowed"
    assert violation


def test_a_number_that_merely_contains_the_answer_is_not_rejected(ph_vault):
    """"288" is not "2.88", and rejecting it would make hints unwritable."""
    allowed, _ = check_outbound(
        "There are 288 milligrams of acid in the flask.", ph_vault
    )

    assert allowed is True


def test_a_structural_number_is_allowed(ph_vault):
    allowed, _ = check_outbound(
        "Write the ICE table with 3 rows: initial, change, and equilibrium.",
        ph_vault,
    )

    assert allowed is True


def test_the_target_structure_cannot_be_handed_over_as_smiles(structure_vault):
    """A SMILES spelled differently from every enumerated form is still the
    answer, and only canonicalisation catches it."""
    allowed, violation = check_outbound(
        "Try drawing O=C(C)OC and compare it to yours.", structure_vault
    )

    assert allowed is False
    assert "SMILES" in violation


def test_the_target_structure_is_caught_however_it_is_written(structure_vault):
    """A different but equivalent SMILES is the same answer."""
    allowed, _ = check_outbound("The answer is COC(C)=O.", structure_vault)

    assert allowed is False


def test_the_molecular_formula_of_the_target_is_withheld(structure_vault):
    allowed, _ = check_outbound("The product is C3H6O2.", structure_vault)

    assert allowed is False


def test_an_empty_hint_is_never_allowed(ph_vault):
    assert check_outbound("", ph_vault) == (False, "empty hint")
    assert check_outbound("   ", ph_vault)[0] is False


def test_no_vault_means_no_generated_hint():
    """Fail closed: with nothing to redact against, nothing generated goes
    out. The static floor is served instead."""
    allowed, violation = check_outbound("Any text at all.", None)

    assert allowed is False
    assert "vault" in violation


def test_the_balanced_equation_cannot_be_stated():
    vault = vault_for_balance("Balance H2 + O2 -> H2O", "H2 + O2 -> H2O")
    allowed, _ = check_outbound("It balances as 2H2 + O2 -> 2H2O.", vault)

    assert allowed is False


def test_a_near_answer_line_is_withheld_below_level_three(ph_vault):
    near = ph_vault.near_answer_lines[0]
    allowed, _ = check_outbound(f"Remember that {near}.", ph_vault)

    assert allowed is False


def test_level_three_may_restate_the_students_own_working(ph_vault):
    """Level 3 works their step, so it may name quantities they produced.
    It still may not state the answer, which the next test asserts."""
    near = ph_vault.near_answer_lines[0]
    allowed, _ = check_outbound(
        f"Remember that {near}.", ph_vault, allow_near_answer=True
    )

    assert allowed is True


def test_level_three_still_cannot_state_the_answer(ph_vault):
    allowed, _ = check_outbound("So pH = 2.88.", ph_vault, allow_near_answer=True)

    assert allowed is False


# ---------------------------------------------------------------------------
# The similarity guard
# ---------------------------------------------------------------------------


def test_a_generated_analogue_reusing_the_students_numbers_is_rejected():
    student = "What is the pH of 0.100 M acetic acid? Ka = 1.8 x 10^-5"
    lazy = "What is the pH of 0.100 M formic acid? Ka = 1.8 x 10^-5"

    assert numbers_differ(student, lazy) is False


def test_a_genuinely_different_analogue_passes_the_guard():
    student = "What mass of NaCl is in 250 mL of 0.400 M solution?"
    analogue = "What mass of KBr is in 750 mL of 0.150 M solution?"

    assert numbers_differ(student, analogue) is True


def test_small_shared_integers_do_not_count_as_reuse():
    """A subscript of 2 is structural, not the number that makes the
    problem this problem."""
    assert numbers_differ("Balance H2 + O2 -> H2O", "Balance N2 + H2 -> NH3") is True


# ---------------------------------------------------------------------------
# Mechanisms 3 and 4: the gate and the budget
# ---------------------------------------------------------------------------


def test_a_single_step_problem_is_always_terminal(structure_vault):
    """"Draw this molecule" has no step before the answer, so level 3 must
    decline on it. That is honest, not a degradation."""
    assert structure_vault.is_terminal([]) is True


def test_a_multi_step_problem_is_not_terminal_at_the_start(ph_vault):
    assert ph_vault.is_terminal([]) is False


def test_reaching_the_second_to_last_quantity_makes_the_step_terminal(ph_vault):
    penultimate = ph_vault.solution.steps[-2]
    lines = [f"{penultimate.quantity.value:.6g}"]

    assert ph_vault.is_terminal(lines) is True


def test_a_balancing_line_one_coefficient_away_is_terminal():
    vault = vault_for_balance("Balance H2 + O2 -> H2O", "H2 + O2 -> H2O")

    assert vault.is_terminal(["H2 + O2 -> 2H2O"]) is True


def test_the_budget_is_spent_server_side():
    store = SessionStore(budget=2)
    vault = vault_for_structure("Draw ethanol", "CCO")
    session = store.create("structure", "Draw ethanol", vault)

    assert store.spend_level_3(session.session_id) is True
    assert store.spend_level_3(session.session_id) is True
    assert store.spend_level_3(session.session_id) is False
    assert store.remaining(session.session_id) == 0


def test_an_unknown_session_cannot_spend_anything():
    store = SessionStore()

    assert store.spend_level_3("made-up-id") is False
    assert store.remaining("made-up-id") is None


def test_a_client_cannot_supply_its_own_budget():
    """HintRequest carries a session id, never a count."""
    fields = set(HintRequest.model_fields)

    assert "session_id" in fields
    assert not any("remaining" in name or "budget" in name for name in fields)


def test_the_session_response_carries_no_vault():
    fields = schemas.ChemistrySessionResponse.model_fields

    assert set(fields) == {"session_id", "topic", "level_3_remaining", "total_steps"}


# ---------------------------------------------------------------------------
# End to end: a rejected hint falls back rather than failing open
# ---------------------------------------------------------------------------


def test_a_leaking_generated_hint_is_replaced_by_the_static_floor(monkeypatch, ph_vault):
    from sessions import SESSIONS

    SESSIONS.clear()
    session = SESSIONS.create("solutions", ph_vault.problem, ph_vault)

    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "_generate_level_1",
        lambda req, session: ("The answer is pH = 2.88.", 100),
    )

    response = hints.generate_hint(
        HintRequest(
            line_number=2,
            error_type="wrong_value",
            level=1,
            subject="chemistry",
            topic="solutions",
            session_id=session.session_id,
            problem=ph_vault.problem,
            student_line="pH = 4.2",
        )
    )

    assert "2.88" not in response.hint
    assert response.source == "fallback"
    assert response.hint  # never empty


# ---------------------------------------------------------------------------
# What a balancing vault treats as the answer.
#
# It used to list bare coefficients, so "2" and "3" were unsayable. In a
# subject where atom counts are small integers that blocked level 1 on almost
# every balancing problem and every level-2 worked example, because any
# example about any reaction contains a small integer. What actually
# discloses the answer is a coefficient attached to a species.
# ---------------------------------------------------------------------------

def test_a_bare_count_is_sayable_on_a_balancing_problem():
    vault = vault_for_balance("Balance N2 + H2 -> NH3", "N2 + H2 -> NH3")

    allowed, violation = check_outbound(
        "There are 2 nitrogen atoms on the left and 2 on the right, so look "
        "at the hydrogens next.",
        vault,
    )

    assert allowed is True, violation


def test_a_coefficient_attached_to_a_species_is_still_blocked():
    vault = vault_for_balance("Balance N2 + H2 -> NH3", "N2 + H2 -> NH3")

    for leak in ["You need 3H2 on the left.", "You need 3 H2 on the left."]:
        allowed, violation = check_outbound(leak, vault)
        assert allowed is False, leak
        assert violation


def test_the_balanced_equation_itself_is_still_blocked():
    vault = vault_for_balance("Balance N2 + H2 -> NH3", "N2 + H2 -> NH3")

    allowed, _ = check_outbound("The answer is N2 + 3H2 -> 2NH3", vault)

    assert allowed is False


def test_larger_coefficients_are_covered_too():
    vault = vault_for_balance(
        "Balance C4H10 + O2 -> CO2 + H2O", "C4H10 + O2 -> CO2 + H2O"
    )

    allowed, _ = check_outbound("Put 13O2 on the left.", vault)

    assert allowed is False

# ---------------------------------------------------------------------------
# Algebra Vault: it is a symbolic solver, so the answer is a number, not a coefficient.
# ---------------------------------------------------------------------------

def test_algebra_vault_contains_solution_without_exposing_it():
    vault = vault_for_algebra("3*x - 12 = 2*x + 5")

    assert vault.topic == "algebra"
    assert 17.0 in vault.numeric_answers
    assert "x = 17" in vault.answer_forms


def test_algebra_vault_supports_fraction_solution():
    vault = vault_for_algebra("2*x = 3")

    assert 1.5 in vault.numeric_answers


def test_algebra_vault_rejects_multiple_solutions():
    with pytest.raises(ValueError):
        vault_for_algebra("x^2 = 9")


def test_algebra_vault_rejects_multiple_variables():
    with pytest.raises(ValueError):
        vault_for_algebra("x + y = 5")

# ---------------------------------------------------------------------------
# Build_math_vault: it is a symbolic solver, so the answer is a number, not a coefficient.
# ---------------------------------------------------------------------------

from answer_vault import build_math_vault


def test_pre_algebra_expression_builds_math_vault():
    vault = build_math_vault(
        topic="pre_algebra",
        problem="12 + 4 * 3",
    )

    assert vault.topic == "pre_algebra"
    assert vault.answer_forms


def test_pre_algebra_equation_builds_math_vault():
    vault = build_math_vault(
        topic="pre_algebra",
        problem="x + 5 = 12",
    )

    assert vault.topic == "pre_algebra"
    assert vault.answer_forms


def test_algebra_builds_math_vault():
    vault = build_math_vault(
        topic="algebra",
        problem="x + 5 = 12",
    )

    assert vault.topic == "algebra"
    assert vault.answer_forms


def test_trigonometry_builds_math_vault():
    vault = build_math_vault(
        topic="trigonometry",
        problem="sin(x)^2 + cos(x)^2",
    )

    assert vault.topic == "trigonometry"
    assert vault.answer_forms


def test_calculus_builds_math_vault():
    vault = build_math_vault(
        topic="calculus",
        problem="d/dx x^3",
    )

    assert vault.topic == "calculus"
    assert vault.answer_forms