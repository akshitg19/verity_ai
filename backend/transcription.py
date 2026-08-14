import base64
import binascii
import os
import re
from functools import lru_cache

from google import genai
from google.auth.exceptions import GoogleAuthError
from google.genai import errors
from google.genai import types

DEFAULT_PROJECT = "cs-sail-2b08"
DEFAULT_LOCATION = "us-central1"
DEFAULT_MODEL = "gemini-2.5-flash"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

PROMPT = (
    "This image shows one line of a student's handwritten math work, "
    "written on ruled notebook paper. Transcribe it as a plain-text math "
    "expression, equation, or calculus statement.\n"
    "Rules:\n"
    "- Use plain ASCII notation only. Never use LaTeX commands, Greek letters, or $ delimiters.\n"
    "- For ordinary math, use digits 0-9, lowercase latin letters, + - * / ^ = < > ( ) . and spaces.\n"
    "- Write square roots as sqrt(x).\n"
    "- Preserve common student derivative notation when it is clearly written.\n"
    "- Valid derivative notation includes: d/dx x^2, dy/dx = 2x, y' = 2x, and f'(x) = 2x.\n"
    "- Do not rewrite dy/dx, y', or f'(x) into d/dx notation if the student wrote that form.\n"
    "- Write indefinite integrals like: int x^2 dx\n"
    "- Write definite integrals like: int 0 to 1 x^2 dx\n"
    "- Write limits like: lim x to 0 sin(x)/x\n"
    "- Use function names such as sin(x), cos(x), tan(x), ln(x), and exp(x).\n"
    "- Preserve standard trig-power notation when clearly written, such as sin^2(x), cos^2(x), or tan^3(x).\n"
    "- The paper has printed horizontal ruling lines in the background. These are NOT "
    "part of the student's handwriting. Do not let a ruling line change a handwritten "
    "'=' into '-' or '<='; only ink strokes the student wrote count.\n"
    "- If part of the line is crossed out or scribbled over, ignore the crossed-out part "
    "and transcribe only what remains legible.\n"
    "- Reply with ONLY the transcribed math, nothing else, no markdown or LaTeX formatting.\n"
    "- If the image is blank or truly unreadable, reply with exactly: UNREADABLE"
)

_WRAPPER_RE = re.compile(r"^\$+|\$+$")
# \frac{a}{b} -> (a)/(b), before generic command stripping eats the braces
_FRAC_RE = re.compile(r"\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}")
_LATEX_CMD_RE = re.compile(r"\\([a-zA-Z]+)")

# Unicode math the model sometimes emits despite the prompt, mapped to the
# ASCII the SymPy judge can parse. Anything not mapped here that isn't
# plain ASCII math will surface as a parse_error verdict, which is the
# correct failure mode (visible, not silent).
_UNICODE_MAP = str.maketrans({
    "−": "-",   # minus sign
    "–": "-",   # en dash
    "—": "-",   # em dash
    "×": "*",   # multiplication x
    "⋅": "*",   # dot operator
    "·": "*",   # middle dot
    "÷": "/",   # division sign
    "²": "^2",  # superscript two  (via replace below; translate needs 1-char)
    "³": "^3",
})


def _clean(text: str) -> str:
    text = text.strip()
    text = _WRAPPER_RE.sub("", text).strip()
    text = _FRAC_RE.sub(r"(\1)/(\2)", text)
    text = _LATEX_CMD_RE.sub(r"\1", text)
    text = text.replace("²", "^2").replace("³", "^3")
    text = text.translate(_UNICODE_MAP)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class TranscriptionInputError(ValueError):
    """The caller supplied an image that cannot be sent for transcription."""


class TranscriptionServiceError(RuntimeError):
    """The external transcription service could not complete the request."""


@lru_cache(maxsize=1)
def _create_client() -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=os.getenv("GOOGLE_CLOUD_PROJECT", DEFAULT_PROJECT),
        location=os.getenv("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION),
    )


def _decode_png(image_base64: str) -> bytes:
    try:
        image_bytes = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise TranscriptionInputError("image_base64 must be valid Base64") from exc

    if not image_bytes.startswith(PNG_SIGNATURE):
        raise TranscriptionInputError("image_base64 must contain a PNG image")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise TranscriptionInputError("PNG image must be 5 MB or smaller")
    return image_bytes


def transcribe_line(image_base64: str) -> tuple[str, bool]:
    """Return normalized text and whether the model could read the PNG."""
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
                max_output_tokens=64,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        text = _clean(response.text or "")
    except (errors.APIError, GoogleAuthError, OSError, ValueError) as exc:
        raise TranscriptionServiceError("Gemini transcription request failed") from exc

    unreadable = not text or text.upper() == "UNREADABLE"
    return text, unreadable
