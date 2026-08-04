"""Hand-drawn molecular structure to SMILES, via the same vision model.

The chemistry twin of transcription.py. The PNG decoding, client creation,
deterministic model config, and error types are deliberately shared with
that module rather than copied, so "what counts as a valid image" and
"what the API does when the service fails" have exactly one definition.

Only the prompt and the output contract differ: this returns a SMILES
string, not math. Like the math path, the model only ever reads. Whether
the structure is right is decided afterwards by RDKit in the judge, and
the student can correct a misread SMILES before it is ever checked.
"""

import os
import re

from google.auth.exceptions import GoogleAuthError
from google.genai import errors
from google.genai import types
from rdkit import Chem

from judge.chemistry import SUPPORTED_ATOMIC_NUMBERS
from transcription import (
    DEFAULT_MODEL,
    TranscriptionInputError,
    TranscriptionServiceError,
    _create_client,
    _decode_png,
)

MAX_SMILES_OUTPUT_TOKENS = 128


def _supported_element_symbols() -> list[str]:
    """Derive the prompt's element list from the judge's supported set, so
    widening the judge cannot leave the prompt behind."""
    periodic_table = Chem.GetPeriodicTable()
    return [
        periodic_table.GetElementSymbol(number)
        for number in sorted(SUPPORTED_ATOMIC_NUMBERS)
    ]


PROMPT = (
    "This image shows one hand-drawn chemical structure from a student's "
    "chemistry homework, drawn on ruled notebook paper. Convert it to a "
    "single SMILES string.\n"
    "Rules:\n"
    "- Reply with ONLY the SMILES string. No prose, no explanation, no "
    "markdown code fences, no backticks, no 'SMILES:' prefix.\n"
    "- Use only these elements: "
    + ", ".join(_supported_element_symbols())
    + ". Do not use any other element, and do not use isotopes, atom maps, "
    "wildcard atoms, or R groups.\n"
    "- Use only single, double, triple, and aromatic bonds.\n"
    "- Output one connected molecule. Do not output a salt, a mixture, or a "
    "reaction; there must be no '.' or '>' in your answer.\n"
    "- A skeletal drawing leaves carbons and their hydrogens implicit. Read "
    "each unlabelled line end and vertex as a carbon, and write the SMILES "
    "the same way, without spelling out implicit hydrogens.\n"
    "- The paper has printed horizontal ruling lines in the background. "
    "These are NOT part of the drawing. Do not read a ruling line as a bond.\n"
    "- If part of the drawing is crossed out or scribbled over, ignore the "
    "crossed-out part and read only what remains.\n"
    "- If the image is blank, or the drawing is not a chemical structure, or "
    "you cannot read it, reply with exactly: UNREADABLE"
)

UNREADABLE_TOKEN = "UNREADABLE"
# The model occasionally wraps its answer despite the prompt. Stripping the
# wrapper is safe; anything else it adds is left alone so the failure stays
# visible in the correction panel rather than being silently mangled.
_CODE_FENCE_RE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$")
_LABEL_PREFIX_RE = re.compile(r"^(?:smiles|structure)\s*[:=]\s*", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")


def _clean(text: str) -> str:
    text = text.strip()
    text = _CODE_FENCE_RE.sub("", text).strip()
    text = text.strip("`").strip()
    text = _LABEL_PREFIX_RE.sub("", text).strip()
    # A SMILES never contains whitespace, so any that survives is formatting.
    return _WHITESPACE_RE.sub("", text)


def transcribe_structure(image_base64: str) -> tuple[str, bool]:
    """Return the SMILES read from the PNG and whether it was readable."""
    image_bytes = _decode_png(image_base64)
    try:
        client = _create_client()
        response = client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", DEFAULT_MODEL),
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                PROMPT,
            ],
            config=types.GenerateContentConfig(
                temperature=0,
                max_output_tokens=MAX_SMILES_OUTPUT_TOKENS,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        smiles = _clean(response.text or "")
    except (errors.APIError, GoogleAuthError, OSError, ValueError) as exc:
        raise TranscriptionServiceError(
            "Gemini structure recognition request failed"
        ) from exc

    unreadable = not smiles or smiles.upper() == UNREADABLE_TOKEN
    if unreadable:
        smiles = ""
    return smiles, unreadable


__all__ = [
    "PROMPT",
    "TranscriptionInputError",
    "TranscriptionServiceError",
    "transcribe_structure",
]
