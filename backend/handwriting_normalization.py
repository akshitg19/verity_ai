"""Conservative, versioned normalization shared by recognition and evaluation."""

from __future__ import annotations

import re


NORMALIZATION_VERSION = "v2"

_UNICODE_REPLACEMENTS = str.maketrans(
    {
        "−": "-",
        "–": "-",
        "—": "-",
        "×": "*",
        "⋅": "*",
        "·": "*",
        "÷": "/",
        "²": "^2",
        "³": "^3",
        "⁺": "+",
        "⁻": "-",
    }
)
_SIMPLE_FRAC_RE = re.compile(r"\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}")
_SIMPLE_SQRT_RE = re.compile(r"\\sqrt\s*\{([^{}]*)\}")
_LATEX_WRAPPER_RE = re.compile(r"^(?:\$+|\\\[|\\\()|(?:\$+|\\\]|\\\))$")


def _normalize_latex(text: str) -> str:
    value = text.strip()
    value = _LATEX_WRAPPER_RE.sub("", value).strip()
    value = value.replace("\\left", "").replace("\\right", "")
    value = value.replace("\\times", "*").replace("\\cdot", "*")
    value = value.replace("\\div", "/")
    value = value.replace("\\,", "").replace("\\;", "").replace("\\!", "")
    # TeX ignores ordinary whitespace in math mode. In particular, a provider
    # may serialize one visible multi-digit number as ``1 0`` even though the
    # rendered glyphs are adjacent. Remove only digit-to-digit math-mode
    # whitespace; spaces in ASCII/text inputs keep their original meaning.
    value = re.sub(r"(?<=\d)\s+(?=\d)", "", value)
    # Iterate so a simple inner fraction can be reduced before an outer one.
    for _ in range(20):
        updated = _SIMPLE_FRAC_RE.sub(r"(\1)/(\2)", value)
        if updated == value:
            break
        value = updated
    for _ in range(20):
        updated = _SIMPLE_SQRT_RE.sub(r"sqrt(\1)", value)
        if updated == value:
            break
        value = updated
    value = re.sub(r"\^\{([^{}]*)\}", r"^(\1)", value)
    value = re.sub(r"_\{([^{}]*)\}", r"_(\1)", value)
    value = value.replace("{", "(").replace("}", ")")
    return value


def normalize_expression(text: str, output_format: str, domain: str) -> str:
    """Normalize presentation differences without correcting mathematical content."""

    value = str(text).strip().translate(_UNICODE_REPLACEMENTS)
    if output_format == "latex":
        value = _normalize_latex(value)
    elif output_format == "jiix":
        # Adapters should extract the JIIX label before scoring. Keep this path
        # deliberately conservative so raw JSON cannot accidentally compare as math.
        value = re.sub(r"\s+", " ", value)
    else:
        value = re.sub(r"\s+", " ", value)

    value = re.sub(r"\s*([+*/^=<>(),])\s*", r"\1", value)
    value = re.sub(r"\s+-\s+", "-", value)
    if domain != "chemistry_text":
        value = re.sub(r"\(\s*([^()]*)\s*\)", r"(\1)", value)
    # Chemistry capitalization is intentionally untouched in every branch.
    return value.strip()
