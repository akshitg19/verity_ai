import re
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hints import _LEVEL_2_FALLBACK, _LEVEL_3_FALLBACK, generate_hint
from schemas import HintRequest

ALGEBRA_CATEGORIES = ["algebraic", "parse_error", "arithmetic", "sign", "division", "distribution", "unsupported"]
CHEMISTRY_CATEGORIES = [
    "structure_mismatch",
    "wrong_functional_group",
    "unbalanced_atoms",
    "unbalanced_charge",
]
KNOWN_CATEGORIES = ALGEBRA_CATEGORIES + CHEMISTRY_CATEGORIES


@pytest.mark.parametrize("level", [1, 2, 3])
@pytest.mark.parametrize("error_type", KNOWN_CATEGORIES + [None])
def test_generate_hint_returns_nonempty_text(level, error_type):
    req = HintRequest(line_number=2, error_type=error_type, level=level)
    resp = generate_hint(req)
    assert resp.level == level
    assert resp.max_level == 3
    assert isinstance(resp.hint, str) and resp.hint.strip()


@pytest.mark.parametrize("level", [1, 2, 3])
def test_hints_never_mention_the_solution_content(level):
    """Structural no-leak check: hint text must never contain any token
    from the student's actual equations, since a template that only sees
    line_number + error_type category has no solution data to leak.
    """
    req = HintRequest(line_number=2, error_type="algebraic", level=level)
    hint_text = generate_hint(req).hint.lower()
    leaked_tokens = ["3x", "2x", "-12", "+5", "-7"]
    for token in leaked_tokens:
        assert token not in hint_text


def test_level_1_points_to_the_flagged_line_only():
    req = HintRequest(line_number=2, error_type="algebraic", level=1)
    hint_text = generate_hint(req).hint
    assert "2" in hint_text  # references line_number
    for token in ["3x", "2x", "-7", "="]:
        assert token not in hint_text


@pytest.mark.parametrize("level", [0, 4, -1])
def test_invalid_level_is_rejected_by_schema(level):
    with pytest.raises(ValidationError):
        HintRequest(line_number=2, error_type="algebraic", level=level)


def test_unknown_error_type_is_rejected_by_schema():
    with pytest.raises(ValidationError):
        HintRequest(line_number=2, error_type="totally_made_up", level=2)


@pytest.mark.parametrize("error_type", CHEMISTRY_CATEGORIES)
@pytest.mark.parametrize("level", [2, 3])
def test_chemistry_categories_have_their_own_template(error_type, level):
    """A chemistry category must not fall through to the algebra-flavoured
    fallback, which tells the student to re-derive the line."""
    req = HintRequest(line_number=2, error_type=error_type, level=level)
    hint_text = generate_hint(req).hint

    assert hint_text not in (_LEVEL_2_FALLBACK, _LEVEL_3_FALLBACK)
    assert hint_text.strip()


@pytest.mark.parametrize("error_type", CHEMISTRY_CATEGORIES)
@pytest.mark.parametrize("level", [1, 2, 3])
def test_chemistry_hints_never_contain_student_structures(error_type, level):
    """Same structural no-leak guarantee as the algebra categories: the
    template only ever sees a line number and a category name."""
    req = HintRequest(line_number=2, error_type=error_type, level=level)
    hint_text = generate_hint(req).hint.lower()
    leaked_tokens = [
        "cco",
        "ccn",
        "cc(=o)oc",
        "c1ccccc1",
        "h2o",
        "2h2",
        "co2",
        "fe^3+",
        "so4",
        "->",
    ]
    for token in leaked_tokens:
        # A bare SMILES like "cco" is also a run of ordinary letters, so it
        # only counts as a leak when it stands alone -- "accounted" is not a
        # leaked structure.
        pattern = re.escape(token)
        if token[0].isalnum() and token[-1].isalnum():
            pattern = rf"\b{pattern}\b"
        assert not re.search(pattern, hint_text), f"hint leaked {token!r}"
