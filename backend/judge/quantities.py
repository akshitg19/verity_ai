"""Parsing and comparison for the numeric claims a chemistry line makes.

Stoichiometry, solutions, and electrochemistry all judge the same shape of
step: a student writes a number, usually with a unit and often with a label,
and the question is whether that number is one the correct working actually
produces. This module is the shared reader for that shape, so
`stoichiometry.py`, `solutions.py`, and `redox.py` never re-implement
"is 500 mL the same as 0.5 L".

Deliberately free of any chemistry: a quantity here is a value, a unit, and
a dimension. What the value *means* is the calling judge's problem.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass


MAX_QUANTITY_LENGTH = 256


class QuantityParseError(ValueError):
    """The text is not a numeric claim this module can read."""


# Canonical unit per dimension, plus the factor that converts each accepted
# spelling into it. Students write "mL" and "cm3" for the same thing and a
# judge that only accepts one of them measures handwriting, not chemistry.
_UNITS: dict[str, tuple[str, str, float]] = {
    # alias: (canonical, dimension, factor to canonical)
    "g": ("g", "mass", 1.0),
    "gram": ("g", "mass", 1.0),
    "grams": ("g", "mass", 1.0),
    "kg": ("g", "mass", 1000.0),
    "mg": ("g", "mass", 1e-3),
    "ug": ("g", "mass", 1e-6),
    "µg": ("g", "mass", 1e-6),
    "amu": ("amu", "atomic_mass", 1.0),
    "u": ("amu", "atomic_mass", 1.0),
    "mol": ("mol", "amount", 1.0),
    "mole": ("mol", "amount", 1.0),
    "moles": ("mol", "amount", 1.0),
    "mmol": ("mol", "amount", 1e-3),
    "umol": ("mol", "amount", 1e-6),
    "l": ("L", "volume", 1.0),
    "liter": ("L", "volume", 1.0),
    "litre": ("L", "volume", 1.0),
    "liters": ("L", "volume", 1.0),
    "litres": ("L", "volume", 1.0),
    "dm3": ("L", "volume", 1.0),
    "ml": ("L", "volume", 1e-3),
    "cm3": ("L", "volume", 1e-3),
    "cc": ("L", "volume", 1e-3),
    "ul": ("L", "volume", 1e-6),
    "m": ("M", "concentration", 1.0),
    "molar": ("M", "concentration", 1.0),
    "mol/l": ("M", "concentration", 1.0),
    "mol/dm3": ("M", "concentration", 1.0),
    "mm": ("M", "concentration", 1e-3),
    "mmol/l": ("M", "concentration", 1e-3),
    "g/mol": ("g/mol", "molar_mass", 1.0),
    "gmol-1": ("g/mol", "molar_mass", 1.0),
    "g/mole": ("g/mol", "molar_mass", 1.0),
    "%": ("%", "percent", 1.0),
    "percent": ("%", "percent", 1.0),
    "v": ("V", "potential", 1.0),
    "volt": ("V", "potential", 1.0),
    "volts": ("V", "potential", 1.0),
    "mv": ("V", "potential", 1e-3),
    "j": ("J", "energy", 1.0),
    "kj": ("J", "energy", 1000.0),
    "kj/mol": ("kJ/mol", "molar_energy", 1.0),
    "j/mol": ("kJ/mol", "molar_energy", 1e-3),
    "atm": ("atm", "pressure", 1.0),
    "k": ("K", "temperature", 1.0),
}

# Labels that are themselves the whole meaning of the number: "pH = 4.74"
# has no unit, and treating the missing unit as an error would be wrong.
DIMENSIONLESS_LABELS = frozenset(
    {"ph", "poh", "pka", "pkb", "pkw", "n", "q", "ratio", "e", "z"}
)

_SUPERSCRIPT_DIGITS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺", "0123456789-+")
_UNICODE_CLEAN = str.maketrans({
    "−": "-",
    "–": "-",
    "—": "-",
    "×": "x",
    "·": "*",
    "⋅": "*",
    "≈": "=",
    "＝": "=",
    " ": " ",
})

# 3.2 x 10^-4, 3.2 * 10^-4, 3.2E-4 -- all the same number written three ways.
_EXPONENT_RE = re.compile(
    r"(?P<mantissa>-?\d+(?:\.\d*)?|-?\.\d+)\s*(?:[x*]\s*10\s*\^?|e)\s*"
    r"(?P<exponent>[+-]?\d+)",
    re.IGNORECASE,
)
# A leading "+" is meaningful in chemistry ("+1" is an oxidation state, not
# an addition), so it is part of the number rather than a stray operator.
_PLAIN_NUMBER_RE = re.compile(r"[+-]?\d+(?:\.\d*)?|[+-]?\.\d+")
_LABEL_RE = re.compile(r"^[a-zA-Zµ°Δ∆][a-zA-Z0-9µ°Δ∆_\[\]\(\)\+\-\s\.']{0,31}$")
# What separates a label from its value. A colon reads the same as an equals
# sign on a page of working, and reading "pH: 2.00" as a unit called "pH"
# turned a correct answer into a parse error.
_LABEL_SEPARATOR_RE = re.compile(r"[=:]")
# A label written with nothing but a space after it: "pH 2.00", "mass 14.61 g".
# Anchored on a letter so it cannot eat a sign, and it stops at the first
# number so the unit is still read from what follows.
_LEADING_LABEL_RE = re.compile(
    r"^(?P<label>[a-zA-Zµ°Δ∆][a-zA-Z0-9µ°Δ∆_\[\]\(\)']*(?:\s+[a-zA-Z][a-zA-Z0-9']*)*)"
    r"\s+(?=[+-]?[\.\d])"
)


@dataclass(frozen=True)
class Quantity:
    """One numeric claim, normalised to a canonical unit."""

    value: float                 # in the canonical unit for `dimension`
    unit: str | None = None      # canonical symbol, e.g. "mol", "M", None
    dimension: str | None = None
    name: str | None = None      # lowercase label written before "="
    sig_figs: int | None = None
    written_unit: str | None = None  # exactly what the student wrote

    def same_dimension(self, other: "Quantity") -> bool:
        return self.dimension == other.dimension


def _count_sig_figs(mantissa: str) -> int:
    digits = mantissa.lstrip("+-")
    if "." in digits:
        whole, _, fraction = digits.partition(".")
        stripped = (whole + fraction).lstrip("0")
        # "0.00250" -> 250 -> 3 sig figs; trailing zeros after a point count.
        return max(len(stripped), 1)
    stripped = digits.strip("0")
    if not stripped:
        return 1
    # Trailing zeros in an integer are ambiguous; count them as significant
    # only up to the last non-zero digit, which is the conservative reading.
    return len(digits.lstrip("0").rstrip("0")) or 1


def _normalise_unit(text: str) -> tuple[str | None, str | None, float]:
    """Map a written unit onto (canonical symbol, dimension, factor)."""
    cleaned = text.strip().translate(_SUPERSCRIPT_DIGITS)
    cleaned = cleaned.replace(" ", "").replace("·", "/").replace("*", "")
    cleaned = re.sub(r"([a-zA-Z])\^?-1", r"/\1", cleaned)
    cleaned = cleaned.replace("^", "")
    if not cleaned:
        return None, None, 1.0

    key = cleaned.lower()
    if key in _UNITS:
        canonical, dimension, factor = _UNITS[key]
        return canonical, dimension, factor

    # "M" and "m" collide (molar vs. metre); chemistry only ever means molar,
    # and the lowercase lookup above already resolved it. Anything else is a
    # unit we do not model, which is an honest parse_error, not a wrong answer.
    raise QuantityParseError(f"unrecognised unit {text.strip()!r}")


def parse_quantity(text: str) -> Quantity:
    """Read one written line as a single numeric claim.

    >>> parse_quantity("n = 2.50 mol").value
    2.5
    >>> parse_quantity("500 mL").value
    0.5
    >>> parse_quantity("3.2 x 10^-4 M").value
    0.00032
    """
    if not isinstance(text, str):
        raise QuantityParseError("quantity must be a string")
    # Superscripts are folded here rather than only in the unit reader,
    # because "3.2 x 10⁻⁴ M" carries its exponent as superscript digits and
    # would otherwise read as two separate numbers.
    raw = text.translate(_UNICODE_CLEAN).translate(_SUPERSCRIPT_DIGITS).strip()
    if not raw:
        raise QuantityParseError("quantity is empty")
    if len(raw) > MAX_QUANTITY_LENGTH:
        raise QuantityParseError("quantity is too long")

    # A student's line is often a chain: "n = m/M = 2.5 mol". The claim is
    # the last segment; the first is the label if it looks like one. A colon
    # counts as an equals sign, because on paper "pH: 2.00" is the same
    # sentence and reading it as a unit called "pH" produced a parse error on
    # a correct answer.
    segments = [segment.strip() for segment in _LABEL_SEPARATOR_RE.split(raw)]
    claim = segments[-1]
    name: str | None = None
    if len(segments) > 1 and _LABEL_RE.match(segments[0] or ""):
        name = segments[0].strip().lower()
    elif len(segments) == 1:
        # No separator at all. "pH 2.00" and "mass 14.61 g" are how a page of
        # working actually reads, and the label has to come off the front
        # before the rest is looked at for a unit.
        leading = _LEADING_LABEL_RE.match(claim)
        if leading and _LABEL_RE.match(leading.group("label").strip()):
            name = leading.group("label").strip().lower()
            claim = claim[leading.end():].strip()
    if not claim:
        raise QuantityParseError(f"{raw!r} has no value after the equals sign")

    exponent_match = _EXPONENT_RE.search(claim)
    if exponent_match:
        mantissa = exponent_match.group("mantissa")
        exponent = int(exponent_match.group("exponent"))
        value = float(mantissa) * (10.0**exponent)
        sig_figs = _count_sig_figs(mantissa)
        remainder = claim[: exponent_match.start()] + claim[exponent_match.end():]
    else:
        number_match = _PLAIN_NUMBER_RE.search(claim)
        if not number_match:
            raise QuantityParseError(f"{raw!r} contains no number")
        # A second number in the same claim means this is working, not an
        # answer ("2.5 mol / 0.5 L"), and guessing which one is meant would
        # be exactly the confident-wrong behaviour the product must not have.
        if _PLAIN_NUMBER_RE.search(claim, number_match.end()):
            raise QuantityParseError(
                f"{claim!r} contains more than one number; write the result alone"
            )
        mantissa = number_match.group(0)
        value = float(mantissa)
        sig_figs = _count_sig_figs(mantissa)
        remainder = claim[: number_match.start()] + claim[number_match.end():]

    if not math.isfinite(value):
        raise QuantityParseError("value is not a finite number")

    written_unit = remainder.strip(" \t.,;:")
    if written_unit:
        canonical, dimension, factor = _normalise_unit(written_unit)
    else:
        canonical, dimension, factor = None, None, 1.0
        if name in {"ph", "poh", "pka", "pkb"}:
            dimension = "log_concentration"

    return Quantity(
        value=value * factor,
        unit=canonical,
        dimension=dimension,
        name=name,
        sig_figs=sig_figs,
        written_unit=written_unit or None,
    )


# How many figures a student has to write before "half a unit in the last
# place" is granted at all, and how far that can ever stretch the door.
MIN_SIG_FIGS_FOR_ROUNDING = 3
MAX_SIG_FIG_TOLERANCE = 0.02


def values_match(
    expected: float,
    written: float,
    *,
    sig_figs: int | None = None,
    relative_floor: float = 2e-3,
) -> bool:
    """Compare two values the way a marker would, not the way a float does.

    A student who writes 0.125 for 0.12499999 is right, and one who writes
    0.13 for a 2-sig-fig answer is right too. The tolerance is therefore the
    wider of "half a unit in the last place the student wrote" and a small
    relative floor that absorbs rounded intermediate constants.
    """
    if not math.isfinite(expected) or not math.isfinite(written):
        return False
    if expected == 0.0:
        return abs(written) <= 1e-12

    tolerance = abs(expected) * relative_floor
    # Half a unit in the last place the student wrote, but only once they
    # have written enough places for that to mean anything.
    #
    # Two significant figures was a hole big enough to drive a wrong answer
    # through: "12" is two figures, half a unit in its last place is 0.5, and
    # an answer of 12.3 sat well inside that. A student writing the whole
    # number was told they were right about a decimal answer, on every
    # numeric topic on the site. Rounding 12.3 to two figures really does
    # give 12, so this is not a rounding rule failing; it is a rule that
    # should not have applied to somebody who never wrote a decimal point.
    #
    # Below three figures the relative floor decides, which still accepts an
    # exact answer written short: 74 for 74.0 differs by nothing at all.
    if sig_figs and sig_figs >= MIN_SIG_FIGS_FOR_ROUNDING and written != 0.0:
        magnitude = math.floor(math.log10(abs(written)))
        last_place = magnitude - (sig_figs - 1)
        # Capped, because sig figs widen the door and do not remove it.
        generous = min(
            0.5 * (10.0**last_place) * 1.001,
            abs(expected) * MAX_SIG_FIG_TOLERANCE,
        )
        tolerance = max(tolerance, generous)
    return abs(expected - written) <= tolerance


def quantities_match(expected: Quantity, written: Quantity) -> bool:
    """Both the number and, when the student wrote one, the dimension."""
    if (
        written.dimension is not None
        and expected.dimension is not None
        and written.dimension != expected.dimension
    ):
        return False
    return values_match(expected.value, written.value, sig_figs=written.sig_figs)


def format_quantity(quantity: Quantity, *, digits: int = 4) -> str:
    """Render a computed quantity for internal logs and vault contents."""
    magnitude = abs(quantity.value)
    if magnitude and (magnitude < 1e-3 or magnitude >= 1e5):
        body = f"{quantity.value:.{digits}e}"
    else:
        body = f"{quantity.value:.{digits}g}"
    return f"{body} {quantity.unit}" if quantity.unit else body


__all__ = [
    "DIMENSIONLESS_LABELS",
    "Quantity",
    "QuantityParseError",
    "format_quantity",
    "parse_quantity",
    "quantities_match",
    "values_match",
]
