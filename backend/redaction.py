"""Outbound redaction: firewall mechanism 2.

Every string produced by the hint layer passes through `check_outbound`
before it is returned. One function, one call site, so the whole guarantee
can be audited by reading this file and grepping for one name.

The check is deterministic string work, never a model. A model asked to
police itself is a model that can be talked out of it; a tokeniser cannot be.

What this catches: the answer stated, in any of the forms the vault
enumerates, as a standalone token, at any numeric precision within
tolerance, as a SMILES that canonicalises to the target, or in the
assignment shapes ("x = 4", "the answer is 4", "pH -> 4.74").

What this does not catch, stated as plainly here as in `final_tasks.md`: the
answer *implied*, described in words, or reachable in one trivial step from
what the hint does say. This is a filter, not a proof. The escalation budget
and the terminal-step gate are what bound that residue, which is why they
are separate mechanisms rather than nice-to-haves.
"""

from __future__ import annotations

import math
import re
import unicodedata

from answer_vault import LEAK_TOLERANCE, AnswerVault
from judge.chemistry import (
    ChemistryParseError,
    UnsupportedChemistryError,
    canonical_smiles,
)
from judge.quantities import values_match


_SUPERSCRIPT_MAP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻", "0123456789+-")
_MINUS_SIGNS = str.maketrans({"−": "-", "–": "-", "—": "-", "→": "->", "⟶": "->"})
_WHITESPACE_RE = re.compile(r"\s+")
# An interpunct standing in for a decimal point, and spaces wedged between
# digits: both are ways of writing the answer that a token match would miss.
_DIGIT_SEPARATOR_RE = re.compile(r"(?<=\d)\s*[·⋅•,]\s*(?=\d)")
_DIGIT_GAP_RE = re.compile(r"(?<=\d)[ \t]+(?=\d)")
_SCIENTIFIC_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*[x*×·]\s*10\s*\^?\s*([+-]?\d+)", re.IGNORECASE
)
_NUMBER_TOKEN_RE = re.compile(r"-?\d+(?:\.\d+)?(?:e[+-]?\d+)?")
_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[.'\-][a-z0-9]+)*|[^\sa-z0-9]")

# "x = 4", "x is 4", "x -> 4", "the answer is 4", "pH equals 4.74".
_ASSIGNMENT_RE = re.compile(
    r"(?:[a-z]{1,3}|\[?[a-z]{1,3}[+\-]?\]?|answer|result|value|ph|poh|"
    r"molarity|yield|potential)\s*"
    r"(?:=|==|is|equals|equal to|->|:)\s*"
    r"(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)",
    re.IGNORECASE,
)
# The shapes that declare something to be the answer. Used on forms that are
# printed in the question and therefore not secret on their own: "H2" is one
# of two species the question names, but "the limiting reagent is H2" states
# the answer whatever else is on the page. Numeric answers have their own
# assignment regex above; this one is for species and formulas.
_ANSWER_LEAD_RE = (
    r"(?:answer|result|limiting\s+(?:reagent|reactant)|"
    r"excess\s+(?:reagent|reactant)|correct\s+(?:one|choice)|"
    r"empirical\s+formula|molecular\s+formula|it)\s*"
    r"(?:is|are|=|:|->|will\s+be|would\s+be|must\s+be|comes\s+out\s+(?:as|to\s+be))\s+"
    r"(?:the\s+)?"
)
_ANSWER_TRAIL_RE = (
    r"\s+(?:is|was|will\s+be|would\s+be)\s+(?:the\s+)?"
    r"(?:limiting|answer|correct|one\b|right\b)"
)


def _declared_as_the_answer(text: str, candidate: str) -> bool:
    escaped = re.escape(candidate)
    leading = re.compile(_ANSWER_LEAD_RE + r"[^.]{0,12}?\b" + escaped + r"\b")
    trailing = re.compile(r"\b" + escaped + r"\b" + _ANSWER_TRAIL_RE)
    return bool(leading.search(text) or trailing.search(text))


# A SMILES-looking run, long enough not to fire on ordinary prose.
_SMILES_CANDIDATE_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"(?=[^\s]*[A-Z])"
    r"[A-Za-z0-9@+\-\[\]\(\)=#\\/\*\.]{4,}"
    r"(?![A-Za-z0-9])"
)


def normalise(text: str) -> str:
    """NFKC, unicode minus and superscripts folded, whitespace collapsed.

    Digits are also de-obfuscated: an interpunct used as a decimal point and
    spaces inserted between digits both hide a number from a naive token
    match, and "2·8 8" is the answer written to evade exactly this filter.
    The cost is that a legitimate hint saying "count 2 3 times" also
    normalises oddly and may be rejected; that trades a worse hint for a
    closed door, which is the right direction to err.
    """
    folded = unicodedata.normalize("NFKC", text or "")
    folded = folded.translate(_SUPERSCRIPT_MAP).translate(_MINUS_SIGNS)
    folded = _DIGIT_SEPARATOR_RE.sub(".", folded)
    folded = _DIGIT_GAP_RE.sub("", folded)
    # "3.2 x 10^-4" has to become one number, not the three tokens 3.2, 10,
    # and -4. Without this a hint could state the answer in scientific
    # notation and no numeric token would ever match it.
    folded = _SCIENTIFIC_RE.sub(r"\1e\2", folded)
    folded = _WHITESPACE_RE.sub(" ", folded)
    return folded.strip().lower()


def tokenise(text: str) -> list[str]:
    """Split normalised text into numbers, identifiers, and operators."""
    return _TOKEN_RE.findall(text)


def _numeric_tokens(text: str) -> list[float]:
    values: list[float] = []
    for match in _NUMBER_TOKEN_RE.finditer(text):
        try:
            value = float(match.group(0))
        except ValueError:
            continue
        if math.isfinite(value):
            values.append(value)
    return values


def _problem_surface(vault: AnswerVault) -> tuple[set[str], str, list[float]]:
    """What the student can already read on their own page.

    Nothing here is a secret. The problem statement is printed in front of
    them, so a hint repeating a word or a number out of it reveals exactly
    nothing, and blocking one costs the whole hint.

    This is not a relaxation of the gate, it is the same correction that was
    already applied once at the vault: "H2" is the answer to a limiting
    reagent question *and* one of the two species named in the question, so a
    hint saying "compare the moles of N2 with the moles of H2" was being
    thrown away for quoting the question. Same for "2.00 M" in a dilution,
    where the given concentration and the answer coincide.

    The assignment check below deliberately does not consult this. "The
    answer is 2.00" is a leak whether or not a 2.00 appears in the question,
    because the shape is what states it.
    """
    normalised = normalise(vault.problem or "")
    tokens = tokenise(normalised)
    given: list[float] = []
    for token in tokens:
        # Whole tokens only. Scanning the raw text for digits would read the
        # 2 and the 4 out of "h2so4" and call them given quantities, and a pH
        # of 2.00 would then be sayable because the acid has two hydrogens.
        try:
            value = float(token)
        except ValueError:
            continue
        if math.isfinite(value):
            given.append(value)
    return set(tokens), normalised, given


def check_outbound(
    text: str,
    vault: AnswerVault | None,
    *,
    allow_near_answer: bool = False,
) -> tuple[bool, str | None]:
    """The single gate. Returns (allowed, violation).

    `allow_near_answer` is set only for level 3, which is permitted to work
    the student's own step and therefore to restate quantities they have
    already produced. It never relaxes the answer check itself.

    Note for anyone tempted to add a relaxation here: the reason level 2 and
    level 1 were once blocked on every balancing problem was not this filter
    being too strict. It was `vault_for_balance` listing bare coefficients as
    answer forms, which made "2" and "3" unsayable in a subject where atom
    counts are small integers. That was fixed at the vault instead, and the
    relaxation this file briefly carried was removed again. Fix the forms,
    not the gate.
    """
    if not text or not text.strip():
        return False, "empty hint"
    if vault is None:
        # No vault means no reference to redact against. Refusing here is
        # what keeps "we could not solve it" from becoming "we generated
        # freely and hoped".
        return False, "no answer vault for this problem"

    normalised = normalise(text)
    tokens = set(tokenise(normalised))
    problem_tokens, problem_text, problem_numbers = _problem_surface(vault)

    for form in vault.answer_forms:
        candidate = normalise(str(form))
        if not candidate:
            continue
        if candidate in problem_tokens or (
            len(candidate) > 3 and candidate in problem_text
        ):
            # Printed in the question. Repeating it is quoting, not leaking,
            # unless the sentence around it says this is the answer.
            if _declared_as_the_answer(normalised, candidate):
                return False, f"declares the answer form {form!r}"
            continue
        # Standalone token, not a substring: "4" inside "24" is not the
        # answer, and rejecting it would make every hint unwritable.
        if candidate in tokens:
            return False, f"states the answer form {form!r}"
        if len(candidate) > 3 and candidate in normalised:
            return False, f"contains the answer form {form!r}"

    for value in _numeric_tokens(normalised):
        if not vault.matches_number(value):
            continue
        if any(
            values_match(given, value, relative_floor=LEAK_TOLERANCE)
            for given in problem_numbers
        ):
            continue
        return False, f"states a value within tolerance of the answer ({value})"

    for match in _ASSIGNMENT_RE.finditer(normalised):
        try:
            value = float(match.group(1))
        except ValueError:
            continue
        if vault.matches_number(value):
            return False, "states the answer in an assignment"

    if vault.structure_forms:
        for candidate in _SMILES_CANDIDATE_RE.findall(text):
            try:
                if canonical_smiles(candidate) in vault.structure_forms:
                    return False, "contains a SMILES equal to the target structure"
            except (ChemistryParseError, UnsupportedChemistryError, ValueError):
                continue

    if not allow_near_answer:
        for line in vault.near_answer_lines:
            folded = normalise(line)
            if folded and len(folded) > 6 and folded in normalised:
                return False, "restates a line adjacent to the answer"

    return True, None


def redact_or_fallback(
    text: str,
    vault: AnswerVault | None,
    fallback: str,
    *,
    allow_near_answer: bool = False,
) -> tuple[str, str | None]:
    """Return the text if it passes, otherwise the static fallback.

    Never fails open, and never returns an empty hint: a rejected hint is
    replaced by the template floor, which cannot leak because it has never
    been told an answer.
    """
    allowed, violation = check_outbound(
        text,
        vault,
        allow_near_answer=allow_near_answer,
    )
    if allowed:
        return text, None
    return fallback, violation


def numbers_differ(first: str, second: str) -> bool:
    """Whether two problems share no numbers -- the similarity guard.

    A generated analogue that reuses the student's numbers is the student's
    problem with cosmetic changes, and asserting the difference mechanically
    is the only way to know; a prompt instruction is not evidence.
    """
    def distinctive(text: str) -> set[float]:
        values = {
            round(value, 9) for value in _numeric_tokens(normalise(text))
        }
        # Small whole numbers are structural -- a subscript, a coefficient,
        # a chain length -- not the numbers that make a problem this
        # problem. Two combustion equations both containing a 2 are not the
        # same question.
        return {
            value
            for value in values
            if not (float(value).is_integer() and abs(value) <= 10)
        }

    first_values = distinctive(first)
    second_values = distinctive(second)
    if not first_values or not second_values:
        return True
    # Any shared distinctive number means the analogue is the student's
    # problem with a substance swapped, which is the cosmetic change the
    # guard exists to catch.
    return not (first_values & second_values)


def values_within(expected: float, written: float) -> bool:
    """Exposed for tests that assert the leak tolerance is what we say."""
    return values_match(expected, written, relative_floor=LEAK_TOLERANCE)


__all__ = [
    "check_outbound",
    "normalise",
    "numbers_differ",
    "redact_or_fallback",
    "tokenise",
    "values_within",
]
