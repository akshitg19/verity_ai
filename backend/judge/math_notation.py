import re


TRIG_POWER_RE = re.compile(
    r"\b(sin|cos|tan|sec|csc|cot)\s*\^\s*(\d+)\s*\(([^()]*)\)",
    re.IGNORECASE,
)

TRIG_POWER_BARE_RE = re.compile(
    r"\b(sin|cos|tan|sec|csc|cot)\s*\^\s*(\d+)\s+([a-zA-Z]+)\b",
    re.IGNORECASE,
)


def normalize_math_notation(text: str) -> str:
    """Normalize common handwritten/textbook notation into parser-friendly form.

    Examples:
        sin^2(x)  -> sin(x)^2
        cos^3(x)  -> cos(x)^3
        sec^2(x) -> sec(x)^2

    This function should only change notation, never mathematical meaning.
    """

    normalized = text.strip()

    normalized = TRIG_POWER_RE.sub(
        lambda match: (
            f"{match.group(1).lower()}({match.group(3)})^{match.group(2)}"
        ),
        normalized,
    )

    normalized = TRIG_POWER_BARE_RE.sub(
        lambda match: (
            f"{match.group(1).lower()}({match.group(3)})^{match.group(2)}"
        ),
        normalized,
    )

    return normalized