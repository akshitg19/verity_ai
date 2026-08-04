from schemas import HintRequest, HintResponse

# Deterministic, template-based hints -- no model call. This is a
# deliberate choice: a hint generator that only ever receives a
# line_number and a generic error_type category (never the judge's raw
# `detail`, which is machine-only) structurally cannot leak the answer,
# because it never has access to one. Keep it that way -- do not wire
# LineVerdict.detail or the problem's solution into these templates.

_LEVEL_1_TEMPLATE = (
    "Look closely at line {line_number}. Compare it to the line right "
    "before it -- what changed between them?"
)

# Level 2: name the category of mistake without describing the fix.
# Covers every category the algebra and chemistry judges emit, plus the
# finer-grained algebra ones planned for the judge, so hints.py doesn't
# need a follow-up change when a judge is extended.
_LEVEL_2_TEMPLATES = {
    "parse_error": (
        "This line isn't written as valid math -- check that every "
        "operator, variable, and the equals sign are all clearly there."
    ),
    "algebraic": (
        "This step isn't equivalent to the line before it. Whatever "
        "operation you performed, make sure it was applied to the whole "
        "of both sides, not just part of one."
    ),
    "arithmetic": (
        "The setup of this step looks right, but a calculation inside it "
        "is off. Recompute the numbers on this line by hand."
    ),
    "sign": (
        "Check the positive/negative signs on this line -- one of them "
        "likely flipped (or didn't flip) when it should have."
    ),
    "division": (
        "Look at how you divided on this line -- check that you divided "
        "every term, on both sides, by the same value."
    ),
    "distribution": (
        "Look at how a term was distributed into parentheses on this "
        "line -- check that it was multiplied through every term inside."
    ),
    "unsupported": (
        "This line doesn't match the problem's setup -- check that every "
        "letter on it is one the problem actually uses, and that the line "
        "is a full equation. If you wrote it correctly, it may have been "
        "misread; try writing it again more clearly."
    ),
    "structure_mismatch": (
        "This isn't the structure the problem asks for. Go through your "
        "drawing atom by atom and check which atoms are joined to which, "
        "and by what kind of bond."
    ),
    "wrong_functional_group": (
        "The group in your structure isn't the one being asked for. Look "
        "closely at the atoms immediately around it and check what is "
        "attached to what."
    ),
    "unbalanced_atoms": (
        "The two sides of this equation don't contain the same number of "
        "every atom. Count each element on the left, count it again on "
        "the right, and find the one that doesn't match."
    ),
    "unbalanced_charge": (
        "Every atom on this line is accounted for, but the total charge "
        "isn't the same on both sides. Add up the charges on each side "
        "and compare them."
    ),
}
_LEVEL_2_FALLBACK = (
    "Something about this step doesn't follow from the line before it. "
    "Re-derive this line from the previous one, one operation at a time."
)

# Level 3: a general conceptual explanation, not tied to this problem's
# specific numbers -- safe by construction, same reasoning as level 2.
_LEVEL_3_TEMPLATES = {
    "parse_error": (
        "A written step should be a complete equation or expression: "
        "every term needs an operator connecting it to the next, and an "
        "equation needs exactly one equals sign separating two sides."
    ),
    "algebraic": (
        "An equation stays true only if you do the exact same thing to "
        "both sides -- add, subtract, multiply, or divide both sides by "
        "the same amount. Skipping a term or applying it to only one "
        "side breaks the equality."
    ),
    "arithmetic": (
        "Even when the algebraic move you're making is the right one, "
        "the arithmetic still has to be carried out correctly -- redo "
        "the addition, subtraction, multiplication, or division by hand "
        "instead of estimating it."
    ),
    "sign": (
        "Subtracting a term is the same as adding its negative. When you "
        "move a term across the equals sign, or distribute a negative "
        "into parentheses, every sign inside has to flip along with it."
    ),
    "division": (
        "Dividing an equation by a value means dividing every term on "
        "both sides by that same value -- not just the term you're "
        "trying to isolate."
    ),
    "distribution": (
        "The distributive property means a(b + c) = ab + ac -- the "
        "outer term has to be multiplied into every term inside the "
        "parentheses, not just the first one."
    ),
    "unsupported": (
        "Every line of your work should use the same variables as the "
        "original problem and stay a complete equation. A stray letter or "
        "a missing side usually means the line was miswritten or misread "
        "rather than a math mistake."
    ),
    "structure_mismatch": (
        "A molecule is defined by which atoms are bonded to which, and by "
        "what kind of bond -- not by how the drawing is arranged on the "
        "page. Two structures drawn quite differently can be the same "
        "molecule, and two that look alike can be different ones."
    ),
    "wrong_functional_group": (
        "Functional groups are told apart by the atoms immediately "
        "surrounding them: whether a carbon carries a double-bonded "
        "oxygen, whether an oxygen sits between two carbons or holds a "
        "hydrogen, and whether a nitrogen sits next to a carbonyl. A "
        "small change there makes it a different group entirely."
    ),
    "unbalanced_atoms": (
        "A chemical equation has to obey conservation of mass: a reaction "
        "rearranges atoms, it never creates or destroys them. Only the "
        "coefficients written in front of each formula may be changed to "
        "make the two sides match -- changing a subscript inside a "
        "formula turns it into a different substance."
    ),
    "unbalanced_charge": (
        "Charge is conserved exactly as mass is. In a half-reaction the "
        "electrons are what make that work: once they are included on the "
        "correct side, the total charge on the left has to equal the "
        "total charge on the right."
    ),
}
_LEVEL_3_FALLBACK = (
    "Re-read the line before this one, and redo this step from scratch "
    "using only that line as your starting point."
)


def generate_hint(req: HintRequest) -> HintResponse:
    if req.level not in (1, 2, 3):
        raise ValueError("level must be 1, 2, or 3")

    if req.level == 1:
        hint = _LEVEL_1_TEMPLATE.format(line_number=req.line_number)
    elif req.level == 2:
        hint = _LEVEL_2_TEMPLATES.get(req.error_type, _LEVEL_2_FALLBACK)
    else:
        hint = _LEVEL_3_TEMPLATES.get(req.error_type, _LEVEL_3_FALLBACK)

    return HintResponse(level=req.level, hint=hint, max_level=3)
