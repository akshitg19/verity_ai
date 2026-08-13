"""Hand-drawn molecular structure to SMILES, via the same vision model.

The chemistry twin of transcription.py. The PNG decoding, client creation,
and error types are deliberately shared with that module rather than copied,
so "what counts as a valid image" and "what the API does when the service
fails" have exactly one definition.

Only the prompt and the output contract differ: this returns a SMILES
string, not math. Like the math path, the model only ever reads. Whether
the structure is right is decided afterwards by RDKit in the judge, and
the student can correct a misread SMILES before it is ever checked.

Two changes from the first version, both from `final_tasks.md`:

* **The throttling is gone.** It ran at 128 output tokens with thinking
  disabled, inherited from math, where a line is a few symbols. A 2D
  structure with implicit carbons, ring closures, and stereochemistry is a
  much harder read, and the reasoning that helps most was switched off.
* **R groups are allowed.** The Aug 4 failure was a correctly *read* general
  ester that nothing downstream could represent. The prompt now asks for the
  wildcard `*` where a student drew R, R', or Ar, and `judge/chemistry.py`
  canonicalises those, so the drawing is judged instead of rejected.
"""

import re
import time

from rdkit import Chem

from judge.chemistry import SUPPORTED_ATOMIC_NUMBERS
from model import ModelError, generate
from transcription import (
    TranscriptionInputError,
    TranscriptionServiceError,
    _decode_png,
)
from google.genai import types


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
    "Work carefully: read the skeleton first, then the heteroatoms, then the "
    "bond orders, then any stereochemistry. Count ring sizes before you "
    "commit to a ring closure.\n"
    "Rules:\n"
    "- Reply with the SMILES string on the first line, and nothing else on "
    "that line. No prose, no markdown code fences, no backticks, no "
    "'SMILES:' prefix.\n"
    "- On a second line, reply with exactly CONFIDENCE: high or "
    "CONFIDENCE: low. Use low if any atom, bond order, ring closure, or "
    "charge was ambiguous, or if the drawing is faint, crossed out, or "
    "partly cut off.\n"
    "- Use only these elements: "
    + ", ".join(_supported_element_symbols())
    + ". Do not use isotopes or atom maps.\n"
    "- If the student drew a generic group -- an R, R', R1, Ar, or X standing "
    "for 'any substituent' -- write it as the SMILES wildcard atom * in that "
    "position. Do not invent a methyl or a phenyl in its place, and do not "
    "refuse the drawing because of it.\n"
    "- Use only single, double, triple, and aromatic bonds.\n"
    "- Output one connected molecule. Do not output a salt, a mixture, or a "
    "reaction; there must be no '.' or '>' in your answer.\n"
    "- A skeletal drawing leaves carbons and their hydrogens implicit. Read "
    "each unlabelled line end and vertex as a carbon, and write the SMILES "
    "the same way, without spelling out implicit hydrogens.\n"
    "- Read a wedge as a bond coming towards the viewer and a dash as one "
    "going away; write the stereochemistry only if the drawing shows it.\n"
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
_FENCE_LINE_RE = re.compile(r"^```[a-zA-Z]*\s*$|^\s*```\s*$", re.MULTILINE)
_LABEL_PREFIX_RE = re.compile(r"^(?:smiles|structure)\s*[:=]\s*", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")
_CONFIDENCE_RE = re.compile(r"^\s*confidence\s*[:=]\s*(high|low)\s*$", re.IGNORECASE)


def _split_confidence(text: str) -> tuple[str, str]:
    """Peel the CONFIDENCE token off, wherever in the reply it landed."""
    confidence = "high"
    kept: list[str] = []
    for line in (text or "").splitlines():
        match = _CONFIDENCE_RE.match(line)
        if match:
            confidence = match.group(1).lower()
            continue
        kept.append(line)
    return "\n".join(kept).strip(), confidence


def _clean(text: str) -> str:
    # Fences come off first: a fenced reply puts ``` on its own first line,
    # so picking the first line before unwrapping would keep the fence and
    # throw the SMILES away.
    text = _FENCE_LINE_RE.sub("", (text or "").strip()).strip()
    text = _CODE_FENCE_RE.sub("", text).strip()
    for line in text.splitlines():
        # Only the first non-empty line is the SMILES; anything after it is
        # commentary the prompt asked for but the model sometimes adds.
        if line.strip():
            text = line.strip()
            break
    text = text.strip("`").strip()
    text = _LABEL_PREFIX_RE.sub("", text).strip()
    # A SMILES never contains whitespace, so any that survives is formatting.
    return _WHITESPACE_RE.sub("", text)


def transcribe_structure(image_base64: str) -> tuple[str, bool, str, int]:
    """Read a drawing. Returns (smiles, unreadable, confidence, latency_ms)."""
    image_bytes = _decode_png(image_base64)
    started = time.perf_counter()
    try:
        result = generate(
            [
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                PROMPT,
            ],
            job="structure",
            temperature=0,
        )
    except ModelError as exc:
        raise TranscriptionServiceError(
            "Gemini structure recognition request failed"
        ) from exc

    body, confidence = _split_confidence(result.text)
    smiles = _clean(body)

    unreadable = not smiles or smiles.upper() == UNREADABLE_TOKEN
    if unreadable:
        smiles = ""
        confidence = "low"
    latency_ms = result.latency_ms or int((time.perf_counter() - started) * 1000)
    return smiles, unreadable, confidence, latency_ms


# ---------------------------------------------------------------------------
# Chemistry written as text, rather than drawn.
#
# The math prompt in transcription.py says "use only digits and lowercase
# latin letters", which is right for algebra and destroys every chemical
# formula it touches: Cl becomes cl, H2O loses its subscript, and Fe^3+
# becomes nonsense. Balancing, stoichiometry, and solutions are all written
# rather than drawn, so they need their own reader.
# ---------------------------------------------------------------------------
TEXT_PROMPT = (
    "This image shows one line of a student's handwritten chemistry work on "
    "ruled notebook paper. It may be a chemical equation, a formula, a "
    "calculation with units, or the name of a compound written in words.\n"
    "Transcribe it as plain text, exactly as written.\n"
    "Rules:\n"
    "- Put the transcription on the first line and nothing else on it.\n"
    "- A name written in words is a name, not a formula. Write propan-2-ol, "
    "ethanoic acid, methyl ethanoate as words, all lowercase, keeping every "
    "hyphen and locant digit. Never convert a name into a formula and never "
    "capitalise a letter inside one.\n"
    "- On a second line reply with exactly CONFIDENCE: high or "
    "CONFIDENCE: low. Use low if any subscript, superscript, charge, "
    "coefficient, or decimal point was ambiguous.\n"
    "- Keep element symbols in their correct case: Cl not CL or cl, Na not "
    "NA, Fe not FE.\n"
    "- Write subscripts as plain digits directly after the element: water is "
    "H2O, sulfate is SO4.\n"
    "- Write a charge with a caret: Fe(3+) written as Fe^3+, sulfate as "
    "SO4^2-, an electron as e-.\n"
    "- Write a reaction arrow as -> and a reversible arrow as <=>.\n"
    "- Keep state symbols if they are written: (s), (l), (g), (aq).\n"
    "- Write scientific notation as 3.2 x 10^-4.\n"
    "- Keep units exactly as written: g, mol, L, mL, M, g/mol, V, %.\n"
    "- Keep any label before an equals sign, such as pH = or n =.\n"
    "- The paper has printed horizontal ruling lines. They are NOT part of "
    "the handwriting; never read one as a minus sign, an equals sign, or a "
    "fraction bar.\n"
    "- If part of the line is crossed out, transcribe only what remains.\n"
    "- If the image is blank or truly unreadable, reply with exactly: "
    "UNREADABLE"
)

_TEXT_WRAPPER_RE = re.compile(r"^\$+|\$+$")
_TEXT_UNICODE_MAP = {
    "−": "-", "–": "-", "—": "-", "⟶": "->", "→": "->", "⇌": "<=>",
    "×": "x", "·": "*", "⋅": "*", "≈": "=",
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    "⁰": "^0", "¹": "^1", "²": "^2", "³": "^3", "⁴": "^4",
    "⁵": "^5", "⁶": "^6", "⁷": "^7", "⁸": "^8", "⁹": "^9",
    "⁺": "+", "⁻": "-",
}


def _clean_text(text: str) -> str:
    body = _FENCE_LINE_RE.sub("", (text or "").strip()).strip()
    body = _CODE_FENCE_RE.sub("", body).strip()
    for line in body.splitlines():
        if line.strip():
            body = line.strip()
            break
    body = _TEXT_WRAPPER_RE.sub("", body).strip()
    for source, target in _TEXT_UNICODE_MAP.items():
        body = body.replace(source, target)
    return _WHITESPACE_RE.sub(" ", body).strip()


def transcribe_chemistry_line(image_base64: str) -> tuple[str, bool, str, int]:
    """Read one handwritten chemistry line. Returns (text, unreadable, confidence, ms)."""
    image_bytes = _decode_png(image_base64)
    started = time.perf_counter()
    try:
        result = generate(
            [
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                TEXT_PROMPT,
            ],
            job="structure",
            temperature=0,
        )
    except ModelError as exc:
        raise TranscriptionServiceError(
            "Gemini chemistry transcription request failed"
        ) from exc

    body, confidence = _split_confidence(result.text)
    text = _clean_text(body)
    unreadable = not text or text.upper() == UNREADABLE_TOKEN
    if unreadable:
        text = ""
        confidence = "low"
    latency_ms = result.latency_ms or int((time.perf_counter() - started) * 1000)
    return text, unreadable, confidence, latency_ms


__all__ = [
    "PROMPT",
    "TEXT_PROMPT",
    "TranscriptionInputError",
    "TranscriptionServiceError",
    "transcribe_chemistry_line",
    "transcribe_structure",
]
