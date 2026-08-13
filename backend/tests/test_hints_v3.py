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
from answer_vault import (
    vault_for_balance, 
    vault_for_solutions, 
    vault_for_structure, 
    vault_for_algebra,
)
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


@pytest.fixture
def algebra_session():
    vault = vault_for_algebra("3*x - 12 = 2*x + 5")
    return SESSIONS.create("algebra", vault.problem, vault)


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

def math_request_for(session, level: int, **overrides) -> HintRequest:
    payload = {
        "line_number": 2,
        "error_type": "algebraic",
        "level": level,
        "subject": "math",
        "topic": "algebra",
        "session_id": session.session_id,
        "problem": session.problem,
        "previous_line": "3*x - 12 = 2*x + 5",
        "student_line": "3*x = 2*x + 7",
    }

    payload.update(overrides)

    return HintRequest(**payload)

# ---------------------------------------------------------------------------
# Math is untouched
# ---------------------------------------------------------------------------


def test_math_without_a_session_uses_static_fallback(monkeypatch):
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


def test_hint_request_accepts_math_topic():
    request = HintRequest(
        line_number=2,
        error_type="algebraic",
        level=1,
        subject="math",
        topic="algebra",
    )

    assert request.subject == "math"
    assert request.topic == "algebra"


# ---------------------------------------------------------------------------
# Falling back rather than failing
# ---------------------------------------------------------------------------


def test_a_problem_we_could_not_solve_still_gets_a_generated_hint(monkeypatch):
    """The Aug 12 product call, and the reason for it.

    A net ionic equation our solubility rules cannot settle used to get the
    static floor on all three levels: one sentence that would fit any problem
    in the topic, plus a link out. The model has never been told an answer
    here, because there is no answer to tell it, so the hint is written from
    the question and their own work.
    """
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "_generate_level_1",
        lambda req, session, retry=None: ("You wrote AgCl on both sides.", 40),
    )
    response = hints.generate_hint(
        HintRequest(
            line_number=1,
            error_type="unbalanced_atoms",
            level=1,
            subject="chemistry",
            topic="balancing",
            student_line="AgNO3 + NaCl -> AgCl + NaNO3",
        )
    )

    assert response.source == "model"
    assert response.hint == "You wrote AgCl on both sides."


def test_an_unsolvable_problem_grants_no_level_3_budget(monkeypatch):
    """The transient session is never stored, so it cannot become a way to
    mint escalations for a problem the store knows nothing about."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "_generate_level_3",
        lambda req, session, retry=None: ("Work the charges through.", 40),
    )
    response = hints.generate_hint(
        HintRequest(
            line_number=1,
            error_type="unbalanced_atoms",
            level=3,
            subject="chemistry",
            topic="balancing",
            student_line="Ag+ + Cl- -> AgCl",
        )
    )

    assert response.source == "model"
    # Never stored, so it cannot be fetched again and cannot accumulate
    # state between requests.
    assert SESSIONS.get("") is None


def test_no_model_still_means_the_static_floor(monkeypatch):
    """Losing the vault is a reason to generate. Losing the model is not."""
    monkeypatch.setattr(hints, "is_configured", lambda: False)
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


def test_a_level_1_that_states_the_answer_is_asked_again(monkeypatch, ph_session):
    """Redaction catching a leak should not cost the student their hint.

    Running every concept live turned this up on three questions in sixty:
    the model reasoned aloud, arrived at the answer, said it, and redaction
    threw the whole hint away. The student then read a generic template for
    a reason that had nothing to do with them. Level 2 already regenerates
    once when verification fails; this is the same trade.
    """
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    attempts = []

    def fake_level_1(req, session, *, retry=None):
        attempts.append(retry)
        if retry:
            return ("You took the log of the concentration you started with, "
                    "not of the x you solved for. Compare those two.", 300)
        return ("You should have got pH = 2.87 here.", 300)

    monkeypatch.setattr(hints, "_generate_level_1", fake_level_1)
    response = hints.generate_hint(request_for(ph_session, 1))

    assert len(attempts) == 2, "exactly one retry"
    assert attempts[0] is None
    assert "thrown away" in attempts[1], "and it says what was wrong"
    assert response.source == "model"
    assert "2.87" not in response.hint


def test_the_retry_is_not_retried(monkeypatch, ph_session):
    """A model that leaks twice is not going to stop on the third ask, and
    every extra attempt is latency the student sits through."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    attempts = []

    def fake_level_1(req, session, *, retry=None):
        attempts.append(retry)
        return ("The answer is pH = 2.87.", 300)

    monkeypatch.setattr(hints, "_generate_level_1", fake_level_1)
    response = hints.generate_hint(request_for(ph_session, 1))

    assert len(attempts) == 2
    assert response.source == "fallback"
    assert "2.87" not in response.hint


def test_a_failed_retry_still_answers(monkeypatch, ph_session):
    """The retry going missing entirely must leave the first result standing,
    not an exception and not an empty hint."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)

    def fake_level_1(req, session, *, retry=None):
        return None if retry else ("pH = 2.87 is what you want.", 300)

    monkeypatch.setattr(hints, "_generate_level_1", fake_level_1)
    response = hints.generate_hint(request_for(ph_session, 1))

    assert response.hint.strip()
    assert response.source == "fallback"


def test_the_retry_tells_the_model_which_rule_it_broke(monkeypatch, ph_session):
    """A retry that repeats the identical prompt is a coin flip. The second
    ask has to say what was wrong with the first."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    prompts = []

    def fake_generate_json(messages, **kwargs):
        prompts.append(messages[0])
        return {"hint": "The answer is pH = 2.87."}, 300

    monkeypatch.setattr(hints, "generate_json", fake_generate_json)
    hints.generate_hint(request_for(ph_session, 1))

    assert len(prompts) == 2
    assert "thrown away" not in prompts[0]
    assert "thrown away" in prompts[1]
    assert "must already appear in the problem" in prompts[1]


@pytest.mark.parametrize(
    "text",
    [
        "In line 3 you took the log of the wrong concentration.",
        "Look at the third line again.",
        "Your step 2 uses the initial concentration.",
        "Check the first line of your working.",
        "The last step compares the wrong two numbers.",
    ],
)
def test_pointing_by_position_is_caught_before_it_is_sent(text):
    """The prompt has said not to do this for a while and the model does it
    anyway: five hints in sixty, live. A rule worth having is a rule that is
    checked, so this one is checked with a regex rather than hoped for."""
    assert hints._points_by_position(text) is True


@pytest.mark.parametrize(
    "text",
    [
        "Where you wrote 4 x 16.00, you counted four oxygens.",
        "You lined up the 2 and the 3 the wrong way round.",
        "Compare the moles of N2 with the moles of H2.",
    ],
)
def test_quoting_the_work_is_not_pointing_by_position(text):
    assert hints._points_by_position(text) is False


def test_a_hint_that_points_by_position_is_asked_again(monkeypatch, ph_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    attempts = []

    def fake_level_1(req, session, *, retry=None):
        attempts.append(retry)
        if retry:
            return ("Where you wrote the log, you used the concentration you "
                    "started with rather than the x you solved for.", 300)
        return ("On the third line you used the wrong concentration.", 300)

    monkeypatch.setattr(hints, "_generate_level_1", fake_level_1)
    response = hints.generate_hint(request_for(ph_session, 1))

    assert len(attempts) == 2
    assert "laid this page out themselves" in attempts[1]
    assert "third line" not in response.hint
    assert response.source == "model"


def test_a_positional_hint_beats_no_hint_when_the_retry_is_no_better(
    monkeypatch, ph_session
):
    """Falling back to the template here would trade a specific hint for a
    generic one. 'On the third line you used the wrong concentration' still
    tells them what they did; the floor tells them nothing."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints,
        "_generate_level_1",
        lambda req, session, *, retry=None: (
            "On the third line you used the wrong concentration.", 300
        ),
    )
    response = hints.generate_hint(request_for(ph_session, 1))

    assert response.source == "model"
    assert "concentration" in response.hint


def test_level_3_gets_the_same_treatment(monkeypatch, ph_session):
    """Level 3 pointed by position live too, on 'step 2' and 'first step'."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    attempts = []

    def fake_level_3(req, session, *, retry=None):
        attempts.append(retry)
        if retry:
            return ("Take the x you solved for and put that into the log, "
                    "not the concentration you started with.", 700)
        return ("Go back to step 2 and use x instead.", 700)

    monkeypatch.setattr(hints, "_generate_level_3", fake_level_3)
    response = hints.generate_hint(request_for(ph_session, 3))

    assert len(attempts) == 2
    assert "step 2" not in response.hint


def test_level_1_is_told_not_to_do_the_arithmetic(monkeypatch, ph_session):
    """The cheapest fix for a leak is a prompt that never invites one."""
    assert "do not multiply, add, or divide anything yourself" in (
        hints._CHEMISTRY_LEVEL_1_PROMPT
    )


def test_level_1_without_the_student_line_falls_back(monkeypatch, ph_session):
    """Level 1 exists to diagnose the step; with no step there is nothing to
    diagnose, and inventing one would be worse than the template."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    response = hints.generate_hint(request_for(ph_session, 1, student_line=None))

    assert response.source == "fallback"

def test_math_level_1_uses_generated_diagnosis(monkeypatch, algebra_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)

    captured = {}

    def fake_generate_json(messages, **kwargs):
        captured["prompt"] = messages[0]
        return (
            {
                "hint": (
                    "You changed the constant incorrectly on the right side. "
                    "Compare what happened to the 12 on both sides."
                )
            },
            250,
        )

    monkeypatch.setattr(hints, "generate_json", fake_generate_json)

    response = hints.generate_hint(
        math_request_for(algebra_session, 1)
    )

    assert response.source == "model"
    assert response.level == 1
    assert response.latency_ms == 250
    assert "changed the constant" in response.hint


def test_math_level_1_uses_math_prompt(monkeypatch, algebra_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)

    captured = {}

    def fake_generate_json(messages, **kwargs):
        captured["prompt"] = messages[0]
        return (
            {"hint": "Check the operation you applied to both sides."},
            100,
        )

    monkeypatch.setattr(hints, "generate_json", fake_generate_json)

    hints.generate_hint(
        math_request_for(algebra_session, 1)
    )

    prompt = captured["prompt"].lower()

    assert "math tutor" in prompt
    assert "chemistry tutor" not in prompt


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


GOOD_ALGEBRA_EXAMPLE = {
    "problem": "7*x + 6 = 34",
    "technique": "Undo the constant term before dividing by the coefficient.",
    "steps": [
        "7*x + 6 = 34",
        "7*x = 28",
        "x = 4",
    ],
    "check": {},
}


BAD_ALGEBRA_EXAMPLE = {
    "problem": "7*x + 6 = 34",
    "technique": "Undo the constant term before dividing by the coefficient.",
    "steps": [
        "7*x + 6 = 34",
        "7*x = 25",
        "x = 4",
    ],
    "check": {},
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


# A different acid at a different concentration whose pH lands on the
# student's own answer of 2.875. Nothing is wrong with it: it verifies, and
# its numbers differ from theirs. It is the collision the audit saw once in
# sixty, where the student reads their own answer inside an example about
# something else.
ECHOING_SOLUTIONS_EXAMPLE = {
    "problem": "What is the pH of 0.0500 M propanoic acid? Ka = 3.6 x 10^-5",
    "technique": "Set up an ICE table and solve for x, then take -log10(x)",
    "steps": [
        "Ka = x^2 / (0.05 - x)",
        "x = 1.3238e-3",
        "pH = 2.8782",
    ],
    "check": {
        "task": "weak_acid_ph",
        "params": {"concentration_m": 0.05, "ka": 3.6e-5},
        "answer": 2.88,
    },
}


def test_an_example_stating_the_students_answer_is_regenerated(
    monkeypatch, ph_session
):
    calls = {"count": 0}

    def collides_then_clears(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            return (ECHOING_SOLUTIONS_EXAMPLE, 500)
        return (GOOD_SOLUTIONS_EXAMPLE, 500)

    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", collides_then_clears)
    response = hints.generate_hint(request_for(ph_session, 2))

    assert calls["count"] == 2
    assert response.worked_example is not None
    assert "2.8782" not in " ".join(response.worked_example.steps)


def test_an_example_that_still_collides_is_shown_anyway(monkeypatch, ph_session):
    """The second attempt is a preference, not a gate.

    The example is a verified solution to a different problem, so a number
    inside it that happens to equal the student's answer is a coincidence and
    not a disclosure. Dropping to the static floor over one would cost the
    student the whole worked example, which is the worse trade while
    withholding is off.
    """
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(
        hints, "generate_json", lambda *a, **k: (ECHOING_SOLUTIONS_EXAMPLE, 500)
    )
    response = hints.generate_hint(request_for(ph_session, 2))

    assert response.source == "model"
    assert response.worked_example is not None
    assert response.worked_example.verified is True


def test_a_coefficient_is_not_read_as_the_students_answer(
    monkeypatch, balance_session
):
    """Small whole numbers are structure, not answers.

    A balancing example is nothing but small integers, and treating each one
    as a possible collision would regenerate every example in the topic.
    """
    calls = {"count": 0}

    def counted(*args, **kwargs):
        calls["count"] += 1
        return (GOOD_BALANCE_EXAMPLE, 700)

    monkeypatch.setattr(hints, "is_configured", lambda: True)
    monkeypatch.setattr(hints, "generate_json", counted)
    response = hints.generate_hint(request_for(balance_session, 2))

    assert calls["count"] == 1
    assert response.worked_example is not None


def test_math_level_2_accepts_verified_example(monkeypatch, algebra_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)

    monkeypatch.setattr(
        hints,
        "generate_json",
        lambda *args, **kwargs: (GOOD_ALGEBRA_EXAMPLE, 500),
    )

    response = hints.generate_hint(
        math_request_for(algebra_session, 2)
    )

    assert response.source == "model"
    assert response.worked_example is not None
    assert response.worked_example.verified is True
    assert response.worked_example.problem == "7*x + 6 = 34"
    assert response.worked_example.steps[-1] == "x = 4"


def test_math_level_2_rejects_invalid_worked_example(
    monkeypatch,
    algebra_session,
):
    monkeypatch.setattr(hints, "is_configured", lambda: True)

    monkeypatch.setattr(
        hints,
        "generate_json",
        lambda *args, **kwargs: (BAD_ALGEBRA_EXAMPLE, 500),
    )

    response = hints.generate_hint(
        math_request_for(algebra_session, 2)
    )

    assert response.worked_example is None
    assert response.source == "fallback"


def test_math_level_2_does_not_use_chemistry_verifier(
    monkeypatch,
    algebra_session,
):
    monkeypatch.setattr(hints, "is_configured", lambda: True)

    monkeypatch.setattr(
        hints,
        "_check_is_correct",
        lambda *args, **kwargs: pytest.fail(
            "math Level 2 must not use chemistry verification"
        ),
    )

    monkeypatch.setattr(
        hints,
        "generate_json",
        lambda *args, **kwargs: (GOOD_ALGEBRA_EXAMPLE, 500),
    )

    response = hints.generate_hint(
        math_request_for(algebra_session, 2)
    )

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


def test_math_level_3_is_terminal_until_math_progress_tracking_exists(
    monkeypatch,
    algebra_session,
):
    monkeypatch.setattr(hints, "WITHHOLD_ANSWER", True)
    monkeypatch.setattr(hints, "is_configured", lambda: True)

    monkeypatch.setattr(
        hints,
        "_generate_level_3",
        lambda *args, **kwargs: pytest.fail(
            "terminal math step must not call the model"
        ),
    )

    response = hints.generate_hint(
        math_request_for(algebra_session, 3)
    )

    assert response.terminal_step is True
    assert response.source == "fallback"


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
        lambda req, session, retry=False: ("The answer is N2 + 3H2 -> 2NH3", 100),
    )

    response = hints.generate_hint(request_for(session, 1, student_line="N2 + H2 -> NH3"))

    assert response.source == "fallback"
    assert "3H2" not in response.hint


# ---------------------------------------------------------------------------
# The check object, in whatever shape the model wrote it
# ---------------------------------------------------------------------------


def test_a_number_written_as_a_string_is_still_a_number():
    """Live, the verifier crashed on `unsupported operand type(s) for /:
    'str' and 'float'`, which was caught as "verification failed" and served
    the student the static floor. A number in quotes is a JSON style
    difference in a description of the example's own problem."""
    from hints import _filtered
    from judge.solutions import SolutionsProblem

    cleaned = _filtered(
        {"concentration_m": "0.10", "ka": "1.8e-5", "volume_l": "0.250 L"},
        SolutionsProblem,
    )

    assert cleaned == {"concentration_m": 0.1, "ka": 1.8e-5, "volume_l": 0.25}


def test_an_amount_written_as_an_object_is_still_an_amount():
    """The other live crash: `'<' not supported between instances of 'dict'
    and 'dict'`, from an amounts map whose values were objects."""
    from hints import _filtered
    from judge.stoichiometry import StoichiometryProblem

    cleaned = _filtered(
        {
            "equation": "N2 + H2 -> NH3",
            "amounts": {"N2": {"mass_g": 28.0}, "H2": "6.0 g"},
        },
        StoichiometryProblem,
    )

    assert cleaned["amounts"] == {"N2": 28.0, "H2": 6.0}
    assert cleaned["equation"] == "N2 + H2 -> NH3"


def test_the_fields_that_are_meant_to_be_text_stay_text():
    """Coercing "H2O" to nothing, or "C6H12O6" to 6, would be worse than the
    bug it fixes."""
    from hints import _filtered
    from judge.stoichiometry import StoichiometryProblem

    cleaned = _filtered(
        {"formula": "C6H12O6", "element": "C", "product": "NH3"},
        StoichiometryProblem,
    )

    assert cleaned == {"formula": "C6H12O6", "element": "C", "product": "NH3"}


def test_an_amount_with_no_number_in_it_is_dropped_not_guessed():
    from hints import _filtered
    from judge.stoichiometry import StoichiometryProblem

    cleaned = _filtered({"amounts": {"N2": "excess"}}, StoichiometryProblem)

    assert cleaned["amounts"] == {}


def test_unknown_fields_are_still_dropped():
    from hints import _filtered
    from judge.solutions import SolutionsProblem

    assert _filtered({"nonsense": 1, "ka": 2.0}, SolutionsProblem) == {"ka": 2.0}


def test_the_contract_says_what_type_each_value_has():
    from hints import _CHEMISTRY_CHECK_CONTRACTS

    contract = _CHEMISTRY_CHECK_CONTRACTS["stoichiometry"]

    assert "plain JSON number" in contract
    assert "never to an object" in contract


# ---------------------------------------------------------------------------
# SMILES is for the machine and the panel, never for the page
# ---------------------------------------------------------------------------


@pytest.fixture
def structure_session():
    vault = vault_for_structure("Draw a structure with the formula C4H10", "CCCC")
    return SESSIONS.create("structure", vault.problem, vault)


def test_a_hint_that_writes_the_smiles_out_is_asked_again(
    monkeypatch, structure_session
):
    """Live, on both formula structure questions: the student drew a chain of
    five carbons, the recogniser read it as CCCCC, and the hint said "You
    drew CCCCC". They never wrote that and would not recognise it."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    attempts = []

    def fake_level_1(req, session, *, retry=None):
        attempts.append(retry)
        if retry:
            return ("You drew a chain of five carbons. Count them against "
                    "the four the formula asks for.", 300)
        return ("You drew CCCCC, which is five carbons.", 300)

    monkeypatch.setattr(hints, "_generate_level_1", fake_level_1)
    response = hints.generate_hint(
        request_for(structure_session, 1, student_line="CCCCC",
                    error_type="structure_mismatch")
    )

    assert len(attempts) == 2
    assert "never seen it" in attempts[1]
    assert "CCCCC" not in response.hint
    assert "five carbons" in response.hint


def test_level_3_gets_the_same_check(monkeypatch, structure_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    attempts = []

    def fake_level_3(req, session, *, retry=None):
        attempts.append(retry)
        if retry:
            return ("Your chain has one carbon too many. Take the end one "
                    "off and the count matches the formula.", 700)
        return ("You wrote CCCCC. That is one carbon too many.", 700)

    monkeypatch.setattr(hints, "_generate_level_3", fake_level_3)
    response = hints.generate_hint(
        request_for(structure_session, 3, student_line="CCCCC",
                    error_type="structure_mismatch")
    )

    assert len(attempts) == 2
    assert "CCCCC" not in response.hint


def test_a_formula_on_a_numeric_topic_is_not_a_smiles(monkeypatch, ph_session):
    """The check is against their own line on the structure topics only. A
    general SMILES detector fires on H2SO4 and on [OH-], which are chemistry
    a student writes and reads every day."""
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    attempts = []

    def fake_level_1(req, session, *, retry=None):
        attempts.append(retry)
        return ("You used [OH-] where the question gives you [H+]. Convert "
                "one to the other with Kw first.", 300)

    monkeypatch.setattr(hints, "_generate_level_1", fake_level_1)
    hints.generate_hint(request_for(ph_session, 1))

    assert attempts == [None], "no retry: nothing was broken"


def test_describing_the_drawing_is_never_retried(monkeypatch, structure_session):
    monkeypatch.setattr(hints, "is_configured", lambda: True)
    attempts = []

    def fake_level_1(req, session, *, retry=None):
        attempts.append(retry)
        return ("Your chain has five carbons in it. The formula asks for "
                "four.", 300)

    monkeypatch.setattr(hints, "_generate_level_1", fake_level_1)
    hints.generate_hint(
        request_for(structure_session, 1, student_line="CCCCC",
                    error_type="structure_mismatch")
    )

    assert attempts == [None]


def test_both_structure_prompts_carry_the_rule():
    assert "never seen it" in hints._CHEMISTRY_LEVEL_1_PROMPT
    assert "never seen it" in hints._CHEMISTRY_LEVEL_3_PROMPT_OPEN


# ---------------------------------------------------------------------------
# A verifier that cannot explain itself cannot be improved
# ---------------------------------------------------------------------------


def test_every_level_2_rejection_says_why():
    """Level 2 is the most common failure in the ladder and the server could
    not name a single reason for it.

    Eleven rejection sites, two of them logged. The live audit could see the
    static floor being served on nine questions and the log had one line for
    one of them. This walks the source and fails if a bare `return False`
    reappears in the verification block.
    """
    import ast
    import inspect

    import hints as module

    source = inspect.getsource(module)
    tree = ast.parse(source)
    checked = {
        "_verify_balancing",
        "_verify_numeric",
        "_verify_stoichiometry",
        "_verify_solutions",
        "_verify_redox",
        "_verify_structure",
        "_verify_math_example",
    }
    silent = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or node.name not in checked:
            continue
        for statement in ast.walk(node):
            if not isinstance(statement, ast.Return):
                continue
            value = statement.value
            is_false = isinstance(value, ast.Constant) and value.value is False
            if not is_false:
                continue
            # A bare `return False` is allowed only where a log sits just
            # above it. Anything else is a rejection with no reason. The
            # window is wide enough for a multi-line logger call.
            line = statement.lineno
            window = source.splitlines()[max(0, line - 9):line]
            if not any("logger." in text for text in window):
                silent.append(f"{node.name}:{line}")

    assert not silent, f"rejections with no reason logged: {silent}"


def test_the_reject_helper_logs_and_returns_false(caplog):
    import logging

    with caplog.at_level(logging.WARNING, logger="hints"):
        result = hints._reject("because %s", "reasons")

    assert result is False
    assert "level 2 rejected: because reasons" in caplog.text


# ---------------------------------------------------------------------------
# Comparing equations by chemistry rather than by spelling
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "written,reference",
    [
        # The charge written the way a person writes it, against the way our
        # own solver writes it. Live, this threw away correct net ionic
        # worked examples twice over: once on the parse and once, after that
        # was fixed, on the comparison.
        ("Ba2+(aq) + SO4^2-(aq) -> BaSO4(s)", "Ba^2+ + SO4^2- -> BaSO4"),
        ("Pb2+(aq) + 2I-(aq) -> PbI2(s)", "Pb^2+ + 2I^- -> PbI2"),
        ("3Ag+(aq) + PO4^3-(aq) -> Ag3PO4(s)", "3Ag^+ + PO4^3- -> Ag3PO4"),
        # A step is a sentence with an equation in it, not a bare equation.
        ("The answer is 4Fe + 3O2 -> 2Fe2O3", "4Fe + 3O2 -> 2Fe2O3"),
    ],
)
def test_the_same_equation_written_differently_still_matches(written, reference):
    assert hints._same_equation(written, reference) is True


@pytest.mark.parametrize(
    "written,reference",
    [
        ("Ag+ + Cl- -> AgCl", "Ag^+ + Br^- -> AgBr"),   # a different halide
        ("2H2 + O2 -> 2H2O", "H2 + O2 -> H2O"),         # different coefficients
        ("Ag+ + Cl- -> AgCl", "Ag^2+ + Cl^- -> AgCl"),  # a different charge
    ],
)
def test_a_different_equation_does_not_match(written, reference):
    """Comparing by composition must not become comparing by nothing."""
    assert hints._same_equation(written, reference) is False
