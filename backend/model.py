"""The one place a model is called for text, and how it is configured.

Split out of `transcription.py` because the chemistry work needs the model
for three jobs with three different budgets, and `final_tasks.md` records
the specific bug this fixes:

> It runs at 128 output tokens, temperature 0, thinking disabled, all
> inherited from math where a line is a few symbols. A 2D structure with
> implicit carbons, ring closures, and stereochemistry is a much harder read
> and we have switched off the reasoning that would help most.

So the budgets are named and per-job here rather than copied per call site,
and every call is timed, because "measure it" is a task in that file too and
an untimed call is an unmeasurable one.

The client and the error types are still `transcription.py`'s, so "what
counts as a service failure" keeps exactly one definition across the repo.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass

from google.auth.exceptions import GoogleAuthError
from google.genai import errors
from google.genai import types

from transcription import (
    DEFAULT_MODEL,
    TranscriptionServiceError,
    _create_client,
)

logger = logging.getLogger(__name__)

# Named budgets. A structure read is a hard perception problem and gets
# reasoning; a hint is a writing problem and gets room to write; a verdict
# is a short judgement and gets thinking but a small output.
BUDGETS = {
    "structure": {"max_output_tokens": 1024, "thinking_budget": -1},
    "hint": {"max_output_tokens": 1536, "thinking_budget": -1},
    # A worked example is a problem statement, a technique line, up to twenty
    # steps and a machine-checkable spec, all as one JSON object. At 2048 the
    # object was being truncated mid-string, which surfaces as "model did not
    # return valid JSON" and drops the student to the static floor.
    "worked_example": {"max_output_tokens": 6144, "thinking_budget": -1},
    "verdict": {"max_output_tokens": 512, "thinking_budget": -1},
    # The math transcription path keeps its original settings; a line of
    # algebra really is a few symbols and the old config was right for it.
    "line": {"max_output_tokens": 64, "thinking_budget": 0},
}
# -1 asks Gemini to choose its own thinking budget. Some deployments reject
# it, so a rejected call is retried once with thinking off rather than
# failing the request.
DYNAMIC_THINKING = -1

_CODE_FENCE_RE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$", re.MULTILINE)


class ModelError(TranscriptionServiceError):
    """The model call could not complete. Same family as a failed read."""


@dataclass(frozen=True)
class ModelResult:
    text: str
    latency_ms: int


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", DEFAULT_MODEL)


def _config(
    job: str,
    *,
    temperature: float,
    thinking_budget: int | None,
    response_mime_type: str | None,
) -> types.GenerateContentConfig:
    budget = BUDGETS.get(job, BUDGETS["hint"])
    resolved = budget["thinking_budget"] if thinking_budget is None else thinking_budget
    return types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=budget["max_output_tokens"],
        thinking_config=types.ThinkingConfig(thinking_budget=resolved),
        response_mime_type=response_mime_type,
    )


def generate(
    parts: list,
    *,
    job: str = "hint",
    temperature: float = 0.2,
    thinking_budget: int | None = None,
    response_mime_type: str | None = None,
) -> ModelResult:
    """One timed model call. Raises ModelError on any service failure."""
    started = time.perf_counter()
    try:
        client = _create_client()
        response = client.models.generate_content(
            model=model_name(),
            contents=parts,
            config=_config(
                job,
                temperature=temperature,
                thinking_budget=thinking_budget,
                response_mime_type=response_mime_type,
            ),
        )
    except errors.APIError as exc:
        # A deployment that rejects dynamic thinking should degrade, not fail.
        if thinking_budget is None and BUDGETS.get(job, {}).get(
            "thinking_budget"
        ) == DYNAMIC_THINKING:
            logger.warning("dynamic thinking rejected, retrying without it: %s", exc)
            return generate(
                parts,
                job=job,
                temperature=temperature,
                thinking_budget=0,
                response_mime_type=response_mime_type,
            )
        raise ModelError("Gemini request failed") from exc
    except (GoogleAuthError, OSError, ValueError) as exc:
        raise ModelError("Gemini request failed") from exc

    latency_ms = int((time.perf_counter() - started) * 1000)
    logger.info("gemini job=%s latency_ms=%d", job, latency_ms)
    return ModelResult(text=(response.text or "").strip(), latency_ms=latency_ms)


def generate_json(
    parts: list,
    *,
    job: str = "hint",
    temperature: float = 0.2,
) -> tuple[dict, int]:
    """A model call whose answer must be one JSON object.

    Structured output is requested through the API and the response is still
    parsed defensively: a hint pipeline that raises on malformed JSON falls
    back to the static floor, which is the correct failure, but it must not
    raise something the caller cannot name.
    """
    result = generate(
        parts,
        job=job,
        temperature=temperature,
        response_mime_type="application/json",
    )
    text = _CODE_FENCE_RE.sub("", result.text).strip()
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ModelError("model did not return valid JSON") from exc
    if not isinstance(payload, dict):
        raise ModelError("model returned JSON that is not an object")
    return payload, result.latency_ms


def is_configured() -> bool:
    """Whether a model call has any chance of succeeding on this machine.

    Used to decide between generating a hint and serving the static floor,
    so a developer with no Google Cloud credentials still gets a working
    product rather than an error.
    """
    try:
        _create_client()
    except Exception:
        return False
    return True


__all__ = [
    "BUDGETS",
    "ModelError",
    "ModelResult",
    "generate",
    "generate_json",
    "is_configured",
    "model_name",
]
