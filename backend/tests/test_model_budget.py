"""What happens when the model runs out of room to answer.

This is the failure that hides. The call succeeds, the response has text in
it, and the only symptom is a JSON parse error several layers up that reads
as "the model wrote prose" when it actually means "the model was cut off".
Level 3 on a long working hit it live, on a molar mass question, and dropped
the student to the static floor with nothing logged but a generic message.

The model is mocked, per the standing rule. What is real is the retry
decision and the error text.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import model
from model import BUDGETS, ModelError, generate, generate_json


class FakeResponse:
    def __init__(self, text, finish_reason=None):
        self.text = text
        self.candidates = [SimpleNamespace(finish_reason=finish_reason)]


class FakeClient:
    """Records every call so the retry can be inspected, not just inferred."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []
        self.models = SimpleNamespace(generate_content=self._generate)

    def _generate(self, *, model, contents, config):
        self.calls.append(config)
        return self._responses.pop(0)


def thinking_budgets(client):
    return [call.thinking_config.thinking_budget for call in client.calls]


def test_a_truncated_answer_is_retried_with_the_thinking_switched_off():
    """Thinking is spent from the answer's budget, so the retry has a reason.

    Asking again with the same settings would truncate again. Turning
    thinking off hands the whole budget to the answer, which is the only
    lever we have that changes the outcome.
    """
    client = FakeClient([
        FakeResponse('{"hint": "half a sen', finish_reason="MAX_TOKENS"),
        FakeResponse('{"hint": "a whole sentence."}', finish_reason="STOP"),
    ])
    with patch.object(model, "_create_client", return_value=client):
        payload, _ = generate_json([{"text": "prompt"}], job="hint")

    assert payload == {"hint": "a whole sentence."}
    assert thinking_budgets(client) == [-1, 0], "the retry must drop thinking"


def test_the_retry_happens_once_and_then_gives_up():
    """A retry loop against a model that always truncates is an outage that
    costs money. The second call passes an explicit budget, so it cannot
    recurse again."""
    client = FakeClient([
        FakeResponse("{oops", finish_reason="MAX_TOKENS"),
        FakeResponse("{oops", finish_reason="MAX_TOKENS"),
    ])
    with patch.object(model, "_create_client", return_value=client):
        with pytest.raises(ModelError):
            generate_json([{"text": "prompt"}], job="hint")

    assert len(client.calls) == 2


def test_the_error_says_which_failure_it_was():
    """'did not return valid JSON' covered both a model that wrote prose and
    a model that was cut off, and those have different fixes."""
    client = FakeClient([
        FakeResponse("{cut", finish_reason="MAX_TOKENS"),
        FakeResponse("{cut", finish_reason="MAX_TOKENS"),
    ])
    with patch.object(model, "_create_client", return_value=client):
        with pytest.raises(ModelError) as caught:
            generate_json([{"text": "prompt"}], job="hint")

    assert "cut off by the output budget" in str(caught.value)


def test_prose_is_reported_as_prose_not_as_truncation():
    client = FakeClient([FakeResponse("Sure! Here is a hint.", finish_reason="STOP")])
    with patch.object(model, "_create_client", return_value=client):
        with pytest.raises(ModelError) as caught:
            generate_json([{"text": "prompt"}], job="hint")

    assert "was not JSON" in str(caught.value)


def test_a_complete_answer_is_never_retried():
    client = FakeClient([FakeResponse('{"hint": "fine"}', finish_reason="STOP")])
    with patch.object(model, "_create_client", return_value=client):
        generate_json([{"text": "prompt"}], job="hint")

    assert len(client.calls) == 1


def test_a_response_with_no_candidates_does_not_crash_the_check():
    """Some responses carry no candidate list at all. Reading a finish reason
    off nothing must not turn a working call into an exception."""
    response = FakeResponse('{"hint": "fine"}')
    response.candidates = []
    client = FakeClient([response])
    with patch.object(model, "_create_client", return_value=client):
        payload, _ = generate_json([{"text": "prompt"}], job="hint")

    assert payload == {"hint": "fine"}


def test_truncation_is_reported_on_the_result_even_when_the_text_parses():
    client = FakeClient([
        FakeResponse("a long answer", finish_reason="MAX_TOKENS"),
        FakeResponse("a long answer", finish_reason="MAX_TOKENS"),
    ])
    with patch.object(model, "_create_client", return_value=client):
        result = generate([{"text": "prompt"}], job="hint")

    assert result.truncated is True


def test_the_hint_budget_leaves_room_for_a_level_three_answer():
    """Level 3 reads the whole working before it writes. 1536 truncated on
    long workings and 3072 still truncated on about one hint in six; this is
    the assertion that stops either drifting back."""
    assert BUDGETS["hint"]["max_output_tokens"] >= 8192
