"""The v3 hint ladder, with the level-2 verification loop.

`final_tasks.md` is explicit about where to spend the test effort here:

> The failure mode that matters is an unverified example reaching a student,
> so test the rejection path harder than the happy path.

So most of this file feeds the verifier deliberately wrong generated
solutions and asserts every one is thrown away. The model is always mocked;
no test in this repo makes a live call.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import hints
from answer_vault import vault_for_balance, vault_for_solutions, vault_for_structure
from judge.solutions import SolutionsProblem
from schemas import HintRequest
from sessions import SESSIONS


@pytest.fixture(autouse=True)
def clean_sessions():
    SESSIONS.clear()
    yield
    SESSIONS.clear()


@pytest.fixture
def ph_session():
    vault = vault_for_solutions(
        "What is the pH of 0.100 M acetic acid? Ka = 1.8 x 10^-5",
        SolutionsProblem(task="weak_acid_ph", concentration_m=0.1, ka=1.8e-5),
    )
    return SESSIONS.create("solutions", vault.problem, vault)


@pytest.fixture
def balance_session():
    vault = vault_for_balance("Balance C3H8 + O2 -> CO2 + H2O", "C3H8 + O2 -> CO2 + H2O")
    return SESSIONS.create("balancing", vault.problem, vault)


def request_for(session, level: int, **overrides) -> HintRequest:
    payload = {
        "line_number": 2,
        "error_type": "wrong_value",
        "level": level,
        "subject": "chemistry",
        "topic": session.topic,
        "session_id": session.session_id,
        "problem": session.problem,
        "student_line": "pH = 4.20",
        "previous_line": "x = 1.3 x 10^-3 M",
    }
    payload.update(overrides)
    return HintRequest(**payload)


# ---------------------------------------------------------------------------
# Math is untouched
# ---------------------------------------------------------------------------


def test_math_hints_still_come_from_the_templates(monkeypatch):
    monkeypatch.setattr(
        hints, "is_configured", lambda: pytest.fail("math must not call a model")
    )
    response = hints.generate_hint(
        HintRequest(line_number=3, error_type="sign", level=2)
    )

    assert "positive/negative signs" in response.hint
    assert response.source == "fallback"
    assert response.worked_example is None


def test_math_level_1_still_names_the_line():
    response = hints.generate_hint(
        HintRequest(line_number=3, error_type="sign", level=1)
    )

    assert "line 3" in response.hint


def test_an_invalid_level_is_rejected():
    with pytest.raises(ValueError):
        hints.generate_hint(
            HintRequest.model_construct(line_number=1, error_type="sign", level=9)
        )


# ---------------------------------------------------------------------------
# Falling back rather than failing
# ---------------------------------------------------------------------------


def test_no_session_means_the_static_floor(monkeypatch):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    response = hints.generate_hint(
        HintRequest(
            line_number=1,
            error_type="unbalanced_atoms",
            level=2,
            subject="chemistry",
            topic="balancing",
        )
    )

    assert response.source == "fallback"
    assert "same number of every atom" in response.hint


def test_an_unconfigured_model_means_the_static_floor(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: False)
    response = hints.generate_hint(request_for(ph_session, 1))

    assert response.source == "fallback"
    assert response.hint


def test_a_generation_failure_falls_back_with_a_resource(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "_generate_level_1", lambda req, session: None)
    response = hints.generate_hint(request_for(ph_session, 1))

    assert response.source == "fallback"
    assert response.resource


def test_an_unknown_category_never_renders_blank(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: False)
    response = hints.generate_hint(
        request_for(ph_session, 2, error_type=None)
    )

    assert response.hint.strip()


# ---------------------------------------------------------------------------
# Level 1: diagnosis
# ---------------------------------------------------------------------------


def test_level_1_returns_the_generated_diagnosis(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "_generate_level_1",
        lambda req, session: (
            "On this line you took the negative log of the initial "
            "concentration rather than of the equilibrium x. Compare the two.",
            420,
        ),
    )
    response = hints.generate_hint(request_for(ph_session, 1))

    assert response.source == "model"
    assert "equilibrium x" in response.hint
    assert response.latency_ms == 420


def test_level_1_without_the_student_line_falls_back(monkeypatch, ph_session):
    """Level 1 exists to diagnose the step; with no step there is nothing to
    diagnose, and inventing one would be worse than the template."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    response = hints.generate_hint(request_for(ph_session, 1, student_line=None))

    assert response.source == "fallback"


# ---------------------------------------------------------------------------
# Level 2: the verification loop. The rejection path, hard.
# ---------------------------------------------------------------------------

GOOD_SOLUTIONS_EXAMPLE = {
    "problem": "What is the pH of 0.0500 M propanoic acid? Ka = 1.3 x 10^-5",
    "technique": "Set up an ICE table and solve for x, then take -log10(x)",
    "steps": [
        "Ka = x^2 / (0.05 - x)",
        "x = 8.0621e-4",
        "pH = 3.0937",
    ],
    "check": {
        "task": "weak_acid_ph",
        "params": {"concentration_m": 0.05, "ka": 1.3e-5},
        "answer": 3.09,
    },
}


def test_a_verified_example_is_returned(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints, "generate_json", lambda *a, **k: (GOOD_SOLUTIONS_EXAMPLE, 900)
    )
    response = hints.generate_hint(request_for(ph_session, 2))

    assert response.source == "model"
    assert response.worked_example is not None
    assert response.worked_example.verified is True
    assert len(response.worked_example.steps) == 3


def test_an_example_with_a_wrong_final_answer_is_rejected(monkeypatch, ph_session):
    bad = {**GOOD_SOLUTIONS_EXAMPLE, "check": {
        **GOOD_SOLUTIONS_EXAMPLE["check"], "answer": 2.10
    }}
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", lambda *a, **k: (bad, 900))
    response = hints.generate_hint(request_for(ph_session, 2))

    assert response.worked_example is None
    assert response.source == "fallback"


def test_an_example_with_an_invented_intermediate_is_rejected(monkeypatch, ph_session):
    """One hallucinated line in the middle and the whole example goes."""
    bad = {
        **GOOD_SOLUTIONS_EXAMPLE,
        "steps": ["Ka = x^2 / (0.05 - x)", "x = 5.5e-3", "pH = 3.0937"],
    }
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", lambda *a, **k: (bad, 900))
    response = hints.generate_hint(request_for(ph_session, 2))

    assert response.worked_example is None


def test_an_example_reusing_the_students_numbers_is_rejected(monkeypatch, ph_session):
    lazy = {
        "problem": "What is the pH of 0.100 M propanoic acid? Ka = 1.8 x 10^-5",
        "technique": "ICE table",
        "steps": ["x = 1.3e-3", "pH = 2.88"],
        "check": {
            "task": "weak_acid_ph",
            "params": {"concentration_m": 0.1, "ka": 1.8e-5},
            "answer": 2.88,
        },
    }
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", lambda *a, **k: (lazy, 900))
    response = hints.generate_hint(request_for(ph_session, 2))

    assert response.worked_example is None
    assert "2.88" not in response.hint


def test_an_example_with_no_steps_is_rejected(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "generate_json",
        lambda *a, **k: ({**GOOD_SOLUTIONS_EXAMPLE, "steps": []}, 900),
    )

    assert hints.generate_hint(request_for(ph_session, 2)).worked_example is None


def test_an_example_with_a_missing_check_is_rejected(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "generate_json",
        lambda *a, **k: ({**GOOD_SOLUTIONS_EXAMPLE, "check": {}}, 900),
    )

    assert hints.generate_hint(request_for(ph_session, 2)).worked_example is None


def test_a_malformed_check_task_is_rejected(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "generate_json",
        lambda *a, **k: (
            {
                **GOOD_SOLUTIONS_EXAMPLE,
                "check": {"task": "not_a_task", "params": {}, "answer": 1.0},
            },
            900,
        ),
    )

    assert hints.generate_hint(request_for(ph_session, 2)).worked_example is None


def test_verification_retries_before_giving_up(monkeypatch, ph_session):
    calls = {"count": 0}

    def flaky(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            return ({**GOOD_SOLUTIONS_EXAMPLE, "check": {
                **GOOD_SOLUTIONS_EXAMPLE["check"], "answer": 9.9
            }}, 500)
        return (GOOD_SOLUTIONS_EXAMPLE, 500)

    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", flaky)
    response = hints.generate_hint(request_for(ph_session, 2))

    assert calls["count"] == 2
    assert response.worked_example is not None


# ---------------------------------------------------------------------------
# Level 2 for balancing, verified by the balancer
# ---------------------------------------------------------------------------

GOOD_BALANCE_EXAMPLE = {
    "problem": "Balance C2H6 + O2 -> CO2 + H2O",
    "technique": "Balance carbon, then hydrogen, then oxygen last",
    "steps": [
        "2C2H6 + O2 -> 4CO2 + H2O",
        "2C2H6 + O2 -> 4CO2 + 6H2O",
        "2C2H6 + 7O2 -> 4CO2 + 6H2O",
    ],
    "check": {
        "unbalanced": "C2H6 + O2 -> CO2 + H2O",
        "balanced": "2C2H6 + 7O2 -> 4CO2 + 6H2O",
    },
}


def test_a_verified_balancing_example_is_returned(monkeypatch, balance_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints, "generate_json", lambda *a, **k: (GOOD_BALANCE_EXAMPLE, 700)
    )
    response = hints.generate_hint(
        request_for(balance_session, 2, error_type="unbalanced_atoms")
    )

    assert response.worked_example is not None
    assert response.worked_example.steps[-1].startswith("2C2H6 + 7O2")


def test_a_balancing_example_that_does_not_balance_is_rejected(
    monkeypatch, balance_session
):
    bad = {
        **GOOD_BALANCE_EXAMPLE,
        "check": {
            "unbalanced": "C2H6 + O2 -> CO2 + H2O",
            "balanced": "2C2H6 + 6O2 -> 4CO2 + 6H2O",
        },
    }
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", lambda *a, **k: (bad, 700))
    response = hints.generate_hint(
        request_for(balance_session, 2, error_type="unbalanced_atoms")
    )

    assert response.worked_example is None


def test_a_balancing_example_whose_steps_never_reach_the_answer_is_rejected(
    monkeypatch, balance_session
):
    bad = {**GOOD_BALANCE_EXAMPLE, "steps": ["2C2H6 + O2 -> 4CO2 + H2O"]}
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", lambda *a, **k: (bad, 700))
    response = hints.generate_hint(
        request_for(balance_session, 2, error_type="unbalanced_atoms")
    )

    assert response.worked_example is None


# ---------------------------------------------------------------------------
# Level 3: the gate and the budget
# ---------------------------------------------------------------------------


def test_level_3_declines_on_a_single_step_problem(monkeypatch):
    """"Draw this molecule" has no step before the answer.

    Pinned to WITHHOLD_ANSWER, which is off by default since Aug 10. The
    mechanism is still here and still tested, so re-arming it is a one-line
    change rather than an act of faith.
    """
    monkeypatch.setattr(hints, "WITHHOLD_ANSWER", True)
    vault = vault_for_structure("Draw methyl ethanoate", "CC(=O)OC")
    session = SESSIONS.create("structure", vault.problem, vault)
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints, "_generate_level_3", lambda req, session: pytest.fail("must not call")
    )

    response = hints.generate_hint(
        request_for(session, 3, error_type="structure_mismatch")
    )

    assert response.terminal_step is True
    assert response.resource
    assert "last step" in response.hint


def test_a_refused_terminal_step_costs_no_budget(monkeypatch):
    vault = vault_for_structure("Draw methyl ethanoate", "CC(=O)OC")
    session = SESSIONS.create("structure", vault.problem, vault)
    monkeypatch.setattr(hints, "is_configured", lambda: True)

    hints.generate_hint(request_for(session, 3, error_type="structure_mismatch"))

    assert SESSIONS.remaining(session.session_id) == 3


def test_level_3_walks_a_non_terminal_step(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "WITHHOLD_ANSWER", True)
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "_generate_level_3",
        lambda req, session: (
            "Your line took -log10 of the concentration you started with. "
            "The ICE table's x is smaller than that, so work out which "
            "quantity belongs inside the logarithm.",
            600,
        ),
    )
    response = hints.generate_hint(request_for(ph_session, 3, student_line="pH = 1.0"))

    assert response.terminal_step is False
    assert response.source == "model"
    assert response.level_3_remaining == 2


def test_the_budget_runs_out_and_says_so(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "WITHHOLD_ANSWER", True)
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints, "_generate_level_3", lambda req, session: ("Walking your step.", 100)
    )

    for _ in range(3):
        hints.generate_hint(request_for(ph_session, 3, student_line="pH = 1.0"))

    response = hints.generate_hint(request_for(ph_session, 3, student_line="pH = 1.0"))

    assert response.level_3_remaining == 0
    assert "worked examples" in response.hint
    assert response.resource


def test_a_model_that_declines_level_3_falls_back(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "_generate_level_3", lambda req, session: None)
    response = hints.generate_hint(request_for(ph_session, 3, student_line="pH = 1.0"))

    assert response.source == "fallback"
    assert response.hint


def test_every_response_reports_the_remaining_budget(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: False)
    response = hints.generate_hint(request_for(ph_session, 1))

    assert response.level_3_remaining == 3


# ---------------------------------------------------------------------------
# The other half of the safeguard: a *correct* example must actually pass.
#
# The docstring at the top of this file says to test the rejection path harder
# than the happy path, and that is right, but it was taken far enough that the
# happy path was never tested at all. Both verifiers rejected every correct
# example a model produced, so level 2 silently served the static floor on
# every topic and no test noticed. These are the acceptance cases.
# ---------------------------------------------------------------------------

BALANCED = {"unbalanced": "Fe + O2 -> Fe2O3", "balanced": "4Fe + 3O2 -> 2Fe2O3"}


@pytest.mark.parametrize(
    "final_step",
    [
        "4Fe + 3O2 -> 2Fe2O3",
        "The balanced equation is 4Fe + 3O2 -> 2Fe2O3",
        "Step 3: 4Fe + 3O2 \u2192 2Fe2O3",
        "So 4Fe + 3O2 -> 2Fe2O3.",
        "Multiply through to get 4Fe + 3O2 => 2Fe2O3, which balances.",
    ],
)
def test_a_correct_balancing_example_passes_however_the_line_is_worded(final_step):
    # A model writes prose around the equation. Parsing the whole line as an
    # equation is what used to fail, and it failed silently.
    assert hints._verify_balancing(BALANCED, ["Count the atoms.", final_step])


@pytest.mark.parametrize(
    "steps",
    [
        ["Count the atoms.", "2Fe + O2 -> Fe2O3"],           # not the balanced form
        ["Count the atoms.", "Balance it carefully."],        # no equation at all
        ["Count the atoms.", "4Fe + 3O2 -> 2FeO"],           # different reaction
    ],
)
def test_a_wrong_balancing_example_is_still_rejected(steps):
    assert not hints._verify_balancing(BALANCED, steps)


def test_wrong_coefficients_are_rejected_even_when_the_line_parses():
    assert not hints._verify_balancing(
        {"unbalanced": "Fe + O2 -> Fe2O3", "balanced": "2Fe + 3O2 -> 2Fe2O3"},
        ["2Fe + 3O2 -> 2Fe2O3"],
    )


WEAK_ACID = {
    "task": "weak_acid_ph",
    "params": {"concentration_m": 0.250, "ka": 1.8e-5},
    "answer": 2.68,
}


def test_algebraic_intermediates_do_not_reject_a_correct_example():
    # x^2 = 4.5e-6 is a real step in the working and no solver enumerates it.
    # Rejecting it threw away every correct numeric example.
    assert hints._verify_solutions(
        WEAK_ACID,
        [
            "Ka = x^2 / (0.250 - x).",
            "Assume x is small: x^2 = 1.8e-5 * 0.250 = 4.5e-6.",
            "x = 2.12e-3 M",
            "pH = 2.68",
        ],
    )


def test_a_wrong_final_answer_is_still_rejected():
    assert not hints._verify_solutions(
        {**WEAK_ACID, "answer": 3.9},
        ["Ka = x^2 / (0.250 - x).", "x = 2.12e-3 M", "pH = 2.68"],
    )


def test_a_line_that_contradicts_a_quantity_we_computed_is_rejected():
    # Naming pH and stating a different one is a contradiction, not an
    # unknown intermediate, and must still throw the example away.
    assert not hints._verify_solutions(
        WEAK_ACID, ["Ka = x^2 / (0.250 - x).", "pH = 3.90"]
    )


# ---------------------------------------------------------------------------
# Withholding off, which is the shipping default since Aug 10.
# ---------------------------------------------------------------------------

def test_level_3_answers_the_terminal_step_when_withholding_is_off(monkeypatch):
    vault = vault_for_structure("Draw methyl ethanoate", "CC(=O)OC")
    session = SESSIONS.create("structure", vault.problem, vault)
    monkeypatch.setattr(hints, "WITHHOLD_ANSWER", False)
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints, "_generate_level_3", lambda req, session: ("Here is the step.", 100)
    )

    response = hints.generate_hint(request_for(session, 3, student_line="CC(=O)OC"))

    assert response.terminal_step is False
    assert response.source == "model"
    assert response.hint == "Here is the step."


def test_the_budget_never_blocks_when_withholding_is_off(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "WITHHOLD_ANSWER", False)
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints, "_generate_level_3", lambda req, session: ("Walking your step.", 100)
    )

    for _ in range(6):
        response = hints.generate_hint(
            request_for(ph_session, 3, student_line="pH = 1.0")
        )
        assert response.source == "model"


def test_levels_1_and_2_are_still_redacted_when_withholding_is_off(monkeypatch):
    # Turning off the level-3 gate must not open the other two rungs.
    vault = vault_for_balance("Balance N2 + H2 -> NH3", "N2 + H2 -> NH3")
    session = SESSIONS.create("balancing", vault.problem, vault)
    monkeypatch.setattr(hints, "WITHHOLD_ANSWER", False)
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "_generate_level_1",
        lambda req, session: ("The answer is N2 + 3H2 -> 2NH3", 100),
    )

    response = hints.generate_hint(request_for(session, 1, student_line="N2 + H2 -> NH3"))

    assert response.source == "fallback"
    assert "3H2" not in response.hint
