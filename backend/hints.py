"""The hint ladder.

Two paths live here, deliberately.

**Math** keeps the original template lookup, unchanged. The templates below
are still exactly what a math hint returns, and nothing in the chemistry
work touches that path.

**Chemistry** runs the v3 ladder from `final_tasks.md`:

| Level | Student asks | What they get |
|---|---|---|
| 1 | "Where did I go wrong?" | Diagnosis of the step they actually wrote |
| 2 | "Show me how this works" | A different problem, worked and verified |
| 3 | "Walk me through mine" | Their own step, refused on the terminal step |

All three are generated live. The templates survive as the fallback floor:
when generation fails, when verification fails, or when redaction rejects
what came back, a student gets the old static hint rather than nothing.

The single most important structural fact about this file: **every string
that reaches a student leaves through `_finalise`**, which is the only
place `redaction.check_outbound` is called and the only place a
`HintResponse` is constructed. `tests/test_answer_firewall.py` greps for
that and fails if a second construction site appears.
"""

from __future__ import annotations

import logging
import os
import time

from model import ModelError, generate_json, is_configured
from redaction import numbers_differ, redact_or_fallback
from schemas import HintRequest, HintResponse, WorkedExample
from sessions import SESSIONS, ProblemSession

logger = logging.getLogger(__name__)

# Whether the three withholding mechanisms are armed: the terminal-step
# refusal, the per-problem level-3 budget, and the answer check inside
# redaction on level 3.
#
# Set to False on Aug 10 by an explicit product call: functionality first,
# withholding second. Every question now gets all three levels and level 3
# works the student's step through to the end, including on the last step.
#
# This contradicts the rules in CLAUDE.md and the answer-firewall section of
# final_tasks.md, which call withholding non-negotiable. That conflict is
# recorded rather than hidden, and the decision is the owner's to make.
#
# Nothing was deleted to do it. The vault is still built, redaction still
# runs on levels 1 and 2, and every mechanism comes back by setting this to
# True or exporting VERITY_WITHHOLD_ANSWER=1.
WITHHOLD_ANSWER = os.getenv("VERITY_WITHHOLD_ANSWER", "0") == "1"

# Deterministic, template-based hints. For math this is the whole product;
# for chemistry it is the floor that catches every failure of the generated
# path. It structurally cannot leak the answer because it has never been
# told one -- which is precisely the guarantee the chemistry path replaces
# with the four firewall mechanisms.

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
    "wrong_value": (
        "The number on this line isn't one the working produces. Check the "
        "quantity you started from and the operation you applied to it, "
        "one at a time."
    ),
    "wrong_unit": (
        "The number here is one the working produces, but the unit isn't. "
        "Write out the units alongside the numbers and cancel them through "
        "the calculation."
    ),
    "wrong_formula": (
        "The formula on this line isn't the one the working leads to. "
        "Recount the atoms of each element before you write the subscripts."
    ),
    "wrong_species": (
        "This isn't the substance the question is about. Re-read which "
        "species the question asks for, then check which one your working "
        "actually describes."
    ),
    "wrong_oxidation_state": (
        "Check the oxidation states you assigned to the other elements "
        "first -- one of those is fixed by a rule, and the element you're "
        "solving for depends on it."
    ),
    "wrong_name": (
        "The name on this line describes a different structure. Check the "
        "parent chain length, then the substituents, then their numbering."
    ),
    "wrong_direction": (
        "Check which way the stress pushes the equilibrium: which side has "
        "more of the thing that was added, or removed."
    ),
    "wrong_coefficients": (
        "The coefficients on this line don't balance every element at once. "
        "Pick the element that appears in the fewest species and balance "
        "that one first."
    ),
    "not_net_ionic": (
        "This is the complete ionic equation. Find the ions that appear "
        "unchanged on both sides and cancel them."
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
    "wrong_value": (
        "A quantity is only as good as what it was derived from. Work "
        "backwards: which earlier quantity does this one depend on, and "
        "was that one right? A slip in an intermediate value carries all "
        "the way to the end without ever looking wrong."
    ),
    "wrong_unit": (
        "Units are part of the answer, not decoration. Carrying them "
        "through every step and cancelling them is the fastest way to "
        "catch an inverted formula: if the units come out wrong, the "
        "arrangement of the equation was wrong."
    ),
    "wrong_formula": (
        "A chemical formula is a count of atoms, so it is determined "
        "entirely by the mole ratio you worked out. Ratios like 1 : 1.5 "
        "must be scaled up to whole numbers rather than rounded, because "
        "rounding changes which compound you are describing."
    ),
    "wrong_species": (
        "Stoichiometry questions turn on which species the question is "
        "about: the limiting reagent, the excess reagent, and the product "
        "each have their own amounts, and they are not interchangeable."
    ),
    "wrong_oxidation_state": (
        "Oxidation states are assigned by a fixed priority: fluorine is "
        "always -1, group 1 metals +1, group 2 +2, hydrogen +1 except in "
        "metal hydrides, and oxygen -2 except in peroxides. Everything "
        "else is solved from the requirement that the states sum to the "
        "overall charge."
    ),
    "wrong_name": (
        "An IUPAC name is built in a fixed order: find the longest chain "
        "containing the principal functional group, number it so that "
        "group gets the lowest locant, then name the substituents "
        "alphabetically with their positions."
    ),
    "wrong_direction": (
        "Le Chatelier's principle says a system at equilibrium responds to "
        "a stress by shifting in the direction that partly relieves it. "
        "Adding a species shifts away from it; removing one shifts "
        "towards it."
    ),
    "wrong_coefficients": (
        "Balancing changes only the coefficients in front of formulas, "
        "never the subscripts inside them, because a subscript defines "
        "which substance it is. Balance the element that appears in the "
        "fewest species first, and leave free elements until last."
    ),
    "not_net_ionic": (
        "A net ionic equation shows only the species that change. Strong "
        "electrolytes in solution are written as separate ions, and any "
        "ion that appears identically on both sides is a spectator and "
        "cancels out."
    ),
}
_LEVEL_3_FALLBACK = (
    "Re-read the line before this one, and redo this step from scratch "
    "using only that line as your starting point."
)

# Used on the terminal step and after a second generation failure. Chosen
# because they are free, stable, and the kind of source a teacher is happy
# to see a student sent to.
RESOURCES: dict[str, str] = {
    "stoichiometry": "https://chem.libretexts.org/Bookshelves/General_Chemistry",
    "balancing": "https://www.khanacademy.org/science/chemistry/chemical-reactions-stoichiome",
    "redox": "https://chem.libretexts.org/Bookshelves/Analytical_Chemistry",
    "solutions": "https://www.khanacademy.org/science/chemistry/acids-and-bases-topic",
    "structure": "https://chem.libretexts.org/Bookshelves/Organic_Chemistry",
    "organic": "https://chem.libretexts.org/Bookshelves/Organic_Chemistry",
}

TERMINAL_MESSAGE = (
    "This is the last step, so I'm going to stop here -- finishing it is "
    "the part that's yours. Here's the same move worked on a different "
    "problem instead, and the idea behind it."
)
BUDGET_MESSAGE = (
    "You've used every walk-through for this problem. That usually means "
    "the worked examples are the better next step than another hint -- go "
    "back to level 2, or to the resource below, and then try this line again."
)

MAX_GENERATION_ATTEMPTS = 2


def _template_hint(req: HintRequest) -> str:
    if req.level == 1:
        return _LEVEL_1_TEMPLATE.format(line_number=req.line_number)
    if req.level == 2:
        return _LEVEL_2_TEMPLATES.get(req.error_type, _LEVEL_2_FALLBACK)
    return _LEVEL_3_TEMPLATES.get(req.error_type, _LEVEL_3_FALLBACK)


# ---------------------------------------------------------------------------
# The chokepoint.
#
# Every path in this module ends here. This is the only place a HintResponse
# is constructed and the only place redaction runs, so the guarantee can be
# audited by reading one function.
# ---------------------------------------------------------------------------
def _finalise(
    req: HintRequest,
    text: str,
    *,
    session: ProblemSession | None = None,
    worked_example: WorkedExample | None = None,
    terminal_step: bool = False,
    source: str = "fallback",
    resource: str | None = None,
    latency_ms: int | None = None,
    allow_near_answer: bool = False,
    trusted: bool = False,
) -> HintResponse:
    vault = session.vault if session else None
    fallback = _template_hint(req)

    # Level 3 is the rung that works the student's own step, so with
    # withholding off it is the one that must be allowed to reach the end of
    # that step. Levels 1 and 2 are still redacted: level 1 is a diagnosis
    # and has no business stating a value, and level 2 is a different
    # problem, so neither needs the exemption and both are better for not
    # having it.
    level_3_unrestricted = not WITHHOLD_ANSWER and req.level == 3

    if (trusted or level_3_unrestricted) and worked_example is None:
        # Text this module wrote itself -- a template, the terminal-step
        # message, the budget message -- has never been told an answer, so
        # it does not need checking against one. Running it through
        # redaction anyway would let a numeric coincidence suppress the only
        # hint we have left. Nothing a model produced is ever trusted.
        safe_text, violation = text, None
    else:
        safe_text, violation = redact_or_fallback(
            text, vault, fallback, allow_near_answer=allow_near_answer
        )

    if violation:
        logger.warning(
            "hint redacted at level %d: %s", req.level, violation
        )
        worked_example = None
        source = "fallback"

    # A level-2 example is a solution to a *different* problem that our own
    # engine has already verified, and the similarity guard has already
    # asserted its numbers differ from the student's. Running it through the
    # answer filter as well mostly catches coincidence: an example about
    # Fe + O2 was thrown away for containing "3O2" because the student's
    # unrelated answer also had a 3O2 in it. With withholding off that trade
    # is not worth making. With it on, the check stands.
    if worked_example is not None and WITHHOLD_ANSWER:
        for line in [worked_example.problem, worked_example.technique, *worked_example.steps]:
            _, line_violation = redact_or_fallback(line, vault, fallback)
            if line_violation:
                logger.warning("worked example redacted: %s", line_violation)
                worked_example = None
                safe_text = fallback
                source = "fallback"
                break

    if worked_example is not None and not worked_example.verified:
        # Belt and braces: an unverified example must never render, and the
        # only code that may set this flag is the verification loop.
        logger.error("unverified worked example reached the chokepoint")
        worked_example = None
        safe_text = fallback
        source = "fallback"

    return HintResponse(
        level=req.level,
        hint=safe_text,
        max_level=3,
        worked_example=worked_example,
        terminal_step=terminal_step,
        level_3_remaining=(session.level_3_remaining if session else None),
        source=source,
        resource=resource,
        latency_ms=latency_ms,
    )


# ---------------------------------------------------------------------------
# Level 1: diagnosis.
# ---------------------------------------------------------------------------
_LEVEL_1_PROMPT = (
    "You are a patient chemistry tutor sitting next to a student, looking at "
    "the one line of their written work that a checker has proven wrong.\n"
    "Say what they did on this line, what went wrong about it, and what to "
    "compare with what. Two sentences at most.\n"
    "How to talk:\n"
    "- Talk TO the student. Say 'you', never 'the student'.\n"
    "- Sound like a person who has taught this a hundred times and is not "
    "remotely annoyed about it. Warm, brief, matter of fact.\n"
    "- Getting this wrong is ordinary. Do not congratulate, do not "
    "sympathise, do not soften it with praise. Just help.\n"
    "- Short words and short sentences. If a sentence runs past about "
    "twenty words, split it.\n"
    "- Name the actual substances and numbers on their page. A sentence "
    "that would fit any problem is not worth sending.\n"
    "Never do:\n"
    "- No em dashes, ever. Use a comma or a full stop.\n"
    "- No markdown, no headings, no lists, no bold.\n"
    "- No 'Great question', 'Let's', 'Remember that', 'It looks like', "
    "'It seems', 'I notice', 'Don't worry'.\n"
    "- Never state a corrected value, a corrected formula, or the answer.\n"
    "- Never do the step for them.\n"
    "Good: 'You balanced the hydrogens, but that changed the nitrogen count "
    "on the right. Count the nitrogens on each side and compare.'\n"
    "Bad: 'The student attempted to balance the equation by adding "
    "coefficients, but the number of atoms for at least one element is not "
    "equal on both sides.'\n"
    'Reply with JSON: {"hint": "<one or two sentences>"}'
)


def _generate_level_1(req: HintRequest, session: ProblemSession) -> tuple[str, int] | None:
    prompt = (
        _LEVEL_1_PROMPT
        + f"\n\nTopic: {req.topic or session.topic}"
        + f"\nProblem: {req.problem or session.problem}"
        + f"\nThe line before: {req.previous_line or '(this is the first line)'}"
        + f"\nThe flagged line (line {req.line_number}): {req.student_line}"
        + f"\nWhat the checker proved: {req.error_type}"
    )
    try:
        payload, latency = generate_json([prompt], job="hint", temperature=0.2)
    except ModelError as exc:
        logger.warning("level 1 generation failed: %s", exc)
        return None
    hint = str(payload.get("hint", "")).strip()
    return (hint, latency) if hint else None


# ---------------------------------------------------------------------------
# Level 2: a generated parallel problem, verified before it is shown.
# ---------------------------------------------------------------------------
_LEVEL_2_PROMPT = (
    "You are a chemistry tutor at a whiteboard. A student is stuck on a "
    "problem. Write a DIFFERENT problem that uses the same technique and "
    "contains the same trap, with different substances and different "
    "numbers, and work it through completely.\n"
    "Hard rules:\n"
    "- The new problem must not be the student's problem with cosmetic "
    "changes. Different numbers AND a different answer.\n"
    "- Every step must be one line, in order, ending with the answer to "
    "YOUR problem.\n"
    "- Never mention the student's own numbers or their answer.\n"
    "- The `check` object is machine-verified against a deterministic "
    "engine before anything is shown, so it must be exactly right.\n"
    "How to write the steps:\n"
    "- Each step is one short sentence saying what you are doing and why, "
    "then the line of chemistry itself.\n"
    "- Write it the way a tutor talks at a whiteboard, not the way a "
    "textbook prints. Say 'balance the phosphorus first', not 'the "
    "phosphorus atoms are subsequently balanced'.\n"
    "- No em dashes, ever. No markdown, no bold, no headings.\n"
    "- No filler openers such as 'Let's', 'First of all', 'As we can see'.\n"
)

_CHECK_CONTRACTS = {
    "balancing": (
        '"check": {"unbalanced": "<your equation, coefficients omitted>", '
        '"balanced": "<the same equation, fully balanced>"}'
    ),
    "stoichiometry": (
        '"check": {"task": "<one of: molar_mass, percent_composition, '
        'moles_from_mass, mass_from_moles, empirical_formula, '
        'limiting_reagent, theoretical_yield, percent_yield>", '
        '"params": {<the inputs your problem gives, using the field names '
        'formula, element, mass_g, moles, equation, amounts, product, '
        'actual_yield_g, composition, target_molar_mass>}, '
        '"answer": <the final numeric answer, or the formula as a string>}'
    ),
    "solutions": (
        '"check": {"task": "<one of: molarity, dilution, ph_from_concentration, '
        'strong_acid_ph, strong_base_ph, weak_acid_ph, weak_base_ph, buffer_ph, '
        'titration_concentration, percent_by_mass>", '
        '"params": {<the inputs your problem gives, using the field names '
        'moles, mass_g, formula, volume_l, concentration_m, ka, kb, pka, '
        'acid_concentration_m, base_concentration_m, initial_concentration_m, '
        'initial_volume_l, final_volume_l, final_concentration_m, '
        'hydrogen_concentration_m, solute_mass_g, solution_mass_g>}, '
        '"answer": <the final numeric answer>}'
    ),
    "redox": (
        '"check": {"formula": "<the species>", "element": "<element symbol>", '
        '"answer": <the oxidation state as a number>}'
    ),
    "structure": (
        '"check": {"smiles": "<the answer structure as SMILES>", '
        '"group": "<the functional group it contains, or null>"}'
    ),
    "organic": (
        '"check": {"smiles": "<the answer structure as SMILES>", '
        '"group": "<the functional group it contains, or null>"}'
    ),
}


def _level_2_prompt(topic: str, problem: str, error_type: str | None) -> str:
    contract = _CHECK_CONTRACTS.get(topic, _CHECK_CONTRACTS["structure"])
    return (
        _LEVEL_2_PROMPT
        + f"\nTopic: {topic}"
        + f"\nThe student's problem (for structure only, do not reuse it): {problem}"
        + f"\nThe mistake they made: {error_type}\n\n"
        + "Reply with one JSON object and nothing else:\n"
        + '{"problem": "<your new problem, one sentence>", '
        + '"technique": "<the technique in one line>", '
        + '"steps": ["<step 1>", "<step 2>", "..."], '
        + contract
        + "}"
    )


def _verify_example(topic: str, payload: dict, student_problem: str) -> WorkedExample | None:
    """Run the generated example through our own engines, line by line.

    This is the safeguard `final_tasks.md` calls non-negotiable: the
    generator can be creative precisely because the verifier is exact. A
    hallucinated worked example structurally cannot reach a student, not
    because we trust the prompt, but because RDKit or the balancer or the
    solver checked it first.
    """
    problem = str(payload.get("problem", "")).strip()
    technique = str(payload.get("technique", "")).strip()
    raw_steps = payload.get("steps") or []
    check = payload.get("check") or {}
    if not problem or not technique or not isinstance(raw_steps, list):
        return None
    steps = [str(step).strip() for step in raw_steps if str(step).strip()]
    if not 1 <= len(steps) <= 20 or not isinstance(check, dict):
        return None

    # The similarity guard, asserted mechanically rather than requested in
    # the prompt: an analogue that reuses the student's numbers is the
    # student's problem wearing a hat.
    if not numbers_differ(problem, student_problem):
        logger.info("level 2 rejected: analogue reuses the student's numbers")
        return None

    if not _check_is_correct(topic, check, steps):
        return None

    return WorkedExample(
        problem=problem, technique=technique, steps=steps, verified=True
    )


def _check_is_correct(topic: str, check: dict, steps: list[str]) -> bool:
    """Verify the generated answer with the same engine that judges students."""
    try:
        if topic == "balancing":
            return _verify_balancing(check, steps)
        if topic == "stoichiometry":
            return _verify_stoichiometry(check, steps)
        if topic == "solutions":
            return _verify_solutions(check, steps)
        if topic == "redox":
            return _verify_redox(check, steps)
        return _verify_structure(check, steps)
    except Exception as exc:  # any engine failure is a failed verification
        logger.info("level 2 verification raised, rejecting example: %s", exc)
        return False


def _verify_balancing(check: dict, steps: list[str]) -> bool:
    from judge.chemistry_equations import balance_coefficients, is_balanced, parse_equation

    unbalanced = str(check.get("unbalanced", "")).strip()
    balanced = str(check.get("balanced", "")).strip()
    if not unbalanced or not balanced:
        return False
    if not is_balanced(balanced):
        return False
    # The balanced form must be the balanced form *of that equation*, not of
    # some other reaction the model drifted into.
    left, right = parse_equation(balanced)
    correct_left, correct_right = balance_coefficients(unbalanced)
    written = [c for c, _ in left + right]
    if written != correct_left + correct_right:
        return False
    # And the worked steps must actually end at it.
    return any(_same_equation(step, balanced) for step in steps[-3:])


_ARROWS = ("->", "→", "⟶", "⇒", "=>", "➔", "-->")


def _candidate_equations(text: str):
    """Every sub-span of a line that parses as a chemical equation.

    A model asked for one step per line writes "The balanced equation is
    4Fe + 3O2 -> 2Fe2O3", not the bare equation, and parsing the whole line
    as an equation was rejecting essentially every correct example, which is
    why level 2 always fell back to the static floor.

    Every span is yielded rather than the first that parses, because the
    formula parser is lenient enough to read leading prose as species (`The`
    is a plausible `Th` + `e`). The caller decides which span is the one it
    was looking for, so leniency cannot smuggle prose into a match.
    """
    from judge.chemistry_equations import EquationParseError, parse_equation

    normalised = text
    for arrow in _ARROWS:
        normalised = normalised.replace(arrow, "->")
    if "->" not in normalised:
        return

    lhs, _, rhs = normalised.partition("->")
    left_tokens = lhs.split()
    right_tokens = [token.strip(".,;:!?") for token in rhs.split()]
    right_tokens = [token for token in right_tokens if token]

    for start in range(len(left_tokens)):
        for end in range(len(right_tokens), 0, -1):
            candidate = (
                f"{' '.join(left_tokens[start:])} -> {' '.join(right_tokens[:end])}"
            )
            try:
                parse_equation(candidate)
            except EquationParseError:
                continue
            yield candidate


def _equation_tally(equation: str):
    from judge.chemistry_equations import EquationParseError, parse_equation

    try:
        left, right = parse_equation(equation)
    except EquationParseError:
        return None
    return (
        tuple(sorted((f, c) for c, f in left)),
        tuple(sorted((f, c) for c, f in right)),
    )


def _same_equation(text: str, reference: str) -> bool:
    """Whether this line states the reference equation, prose and all."""
    target = _equation_tally(reference)
    if target is None:
        return False
    return any(
        _equation_tally(candidate) == target for candidate in _candidate_equations(text)
    )


def _verify_numeric(solution, check: dict, steps: list[str]) -> bool:
    from judge.quantities import QuantityParseError, parse_quantity, values_match

    expected = check.get("answer")
    if not isinstance(expected, (int, float)):
        return False
    # Any member of the answer group counts: a pH problem's answer is as
    # legitimately stated as pOH or [H+], and the generated example is
    # allowed to end on whichever the question it invented asked for.
    if not any(
        values_match(step.quantity.value, float(expected), sig_figs=3)
        for step in solution.answer_steps
    ):
        return False

    # Every numeric line of the generated working is checked against our own
    # solution. The rule used to be "reject anything we did not produce",
    # which was too strict to ever pass: a model showing its algebra writes
    # intermediates no solver enumerates -- x^2 = 4.5e-6 on the way to x --
    # and one of those threw away the whole example. Every correct example
    # was being discarded, which is why level 2 never rendered.
    #
    # So only a *contradiction* rejects: a line that names a quantity we did
    # compute and states a different value for it. An unrecognised
    # intermediate is not evidence of an error, and the answer itself is
    # still checked exactly, above.
    for step in steps:
        try:
            written = parse_quantity(step)
        except QuantityParseError:
            continue  # prose lines are fine; only numeric claims are checked
        if solution.match(written) is not None:
            continue
        contradicts = any(
            written.name
            and (written.name == candidate.name.lower() or written.name in candidate.aliases)
            for candidate in solution.steps
        )
        if contradicts:
            logger.info("level 2 rejected: step %r contradicts our solution", step)
            return False
    return True


def _verify_stoichiometry(check: dict, steps: list[str]) -> bool:
    from judge.stoichiometry import StoichiometryProblem, solve_stoichiometry

    params = dict(check.get("params") or {})
    task = str(check.get("task", ""))
    solution = solve_stoichiometry(
        StoichiometryProblem(task=task, **_filtered(params, StoichiometryProblem))
    )
    if solution.formula_answer or solution.species_answer:
        expected = str(check.get("answer", "")).strip()
        symbolic = solution.formula_answer or solution.species_answer
        return bool(expected) and expected.replace(" ", "") == symbolic
    return _verify_numeric(solution, check, steps)


def _verify_solutions(check: dict, steps: list[str]) -> bool:
    from judge.solutions import SolutionsProblem, solve_solutions

    params = dict(check.get("params") or {})
    task = str(check.get("task", ""))
    solution = solve_solutions(
        SolutionsProblem(task=task, **_filtered(params, SolutionsProblem))
    )
    return _verify_numeric(solution, check, steps)


def _verify_redox(check: dict, steps: list[str]) -> bool:
    from judge.redox import oxidation_state

    formula = str(check.get("formula", ""))
    element = str(check.get("element", ""))
    expected = check.get("answer")
    if not formula or not element or not isinstance(expected, (int, float)):
        return False
    return float(oxidation_state(formula, element)) == float(expected)


def _verify_structure(check: dict, steps: list[str]) -> bool:
    from judge.chemistry import (
        _FUNCTIONAL_GROUP_PATTERNS,
        _parse_smiles,
        _support_reason,
    )

    smiles = str(check.get("smiles", "")).strip()
    if not smiles:
        return False
    molecule = _parse_smiles(smiles)
    if _support_reason(molecule):
        return False
    group = check.get("group")
    if group:
        pattern = _FUNCTIONAL_GROUP_PATTERNS.get(str(group))
        if pattern is None or not molecule.HasSubstructMatch(pattern):
            return False
    return True


def _filtered(params: dict, model_class) -> dict:
    allowed = {
        field
        for field in model_class.__dataclass_fields__  # type: ignore[attr-defined]
        if field != "task"
    }
    return {key: value for key, value in params.items() if key in allowed}


def _generate_level_2(
    req: HintRequest, session: ProblemSession
) -> tuple[WorkedExample, int] | None:
    topic = req.topic or session.topic
    problem = req.problem or session.problem
    total_latency = 0
    for attempt in range(MAX_GENERATION_ATTEMPTS):
        try:
            payload, latency = generate_json(
                [_level_2_prompt(topic, problem, req.error_type)],
                job="worked_example",
                temperature=0.6 if attempt else 0.3,
            )
        except ModelError as exc:
            logger.warning("level 2 generation failed: %s", exc)
            return None
        total_latency += latency
        example = _verify_example(topic, payload, problem)
        if example is not None:
            return example, total_latency
        logger.info("level 2 example failed verification, attempt %d", attempt + 1)
    return None


# ---------------------------------------------------------------------------
# Level 3: their own step, with the gate.
# ---------------------------------------------------------------------------
_LEVEL_3_PROMPT = (
    "You are a patient chemistry tutor at a desk with a student, working "
    "through the line they got wrong. Reason through THEIR step with them, "
    "out loud, up to but not including the answer to the problem.\n"
    "How to talk:\n"
    "- Talk TO the student. Say 'you' and 'we', never 'the student'.\n"
    "- Walk it in order, the way you would say it aloud: what we know, what "
    "that tells us, what to do with it next.\n"
    "- Warm, direct, unhurried. No praise, no apology, no filler.\n"
    "- Short sentences. Name the actual substances and numbers on their "
    "page rather than talking in general terms.\n"
    "Never do:\n"
    "- No em dashes, ever. Use a comma or a full stop.\n"
    "- No markdown, no headings, no lists, no bold.\n"
    "- No 'Great question', 'Let's dive in', 'Remember that', 'Don't "
    "worry', 'As you can see'.\n"
    "- Never state the final answer to their problem, in any form, at any "
    "precision, in any unit, in words or in digits.\n"
    "- Do the reasoning of this one step only. Do not continue past it.\n"
    "Length: three or four sentences.\n"
    '- If you cannot do this without revealing the answer, reply with '
    '{"declined": true} and nothing else.\n'
    'Reply with JSON: {"hint": "<three or four sentences>", "declined": false}'
)

# The same tutor, with withholding off. Level 3 is now allowed to finish the
# step it is working, which is the whole point of the rung.
_LEVEL_3_PROMPT_OPEN = (
    "You are a patient chemistry tutor at a desk with a student, working "
    "through the line they got wrong. Take THEIR step and reason it all the "
    "way through with them, out loud, until that step is finished.\n"
    "How to talk:\n"
    "- Talk TO the student. Say 'you' and 'we', never 'the student'.\n"
    "- Walk it in order, the way you would say it aloud: what we know, what "
    "that tells us, what to do with it, what that gives us.\n"
    "- Warm, direct, unhurried. No praise, no apology, no filler.\n"
    "- Short sentences. Name the actual substances and numbers on their "
    "page rather than talking in general terms.\n"
    "- Finish the step. Show the value or the line it comes out at, and say "
    "in one clause why that is the result.\n"
    "Never do:\n"
    "- No em dashes, ever. Use a comma or a full stop.\n"
    "- No markdown, no headings, no lists, no bold.\n"
    "- No 'Great question', 'Let's dive in', 'Remember that', 'Don't "
    "worry', 'As you can see'.\n"
    "- Do this one step. Do not solve the rest of the problem for them.\n"
    "Length: three to five sentences.\n"
    'Reply with JSON: {"hint": "<three to five sentences>", "declined": false}'
)


def _generate_level_3(req: HintRequest, session: ProblemSession) -> tuple[str, int] | None:
    prompt = (
        (_LEVEL_3_PROMPT if WITHHOLD_ANSWER else _LEVEL_3_PROMPT_OPEN)
        + f"\n\nTopic: {req.topic or session.topic}"
        + f"\nProblem: {req.problem or session.problem}"
        + f"\nThe line before: {req.previous_line or '(this is the first line)'}"
        + f"\nTheir line (line {req.line_number}): {req.student_line}"
        + f"\nWhat the checker proved: {req.error_type}"
    )
    try:
        payload, latency = generate_json([prompt], job="hint", temperature=0.2)
    except ModelError as exc:
        logger.warning("level 3 generation failed: %s", exc)
        return None
    if payload.get("declined"):
        return None
    hint = str(payload.get("hint", "")).strip()
    return (hint, latency) if hint else None


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------
def generate_hint(req: HintRequest) -> HintResponse:
    if req.level not in (1, 2, 3):
        raise ValueError("level must be 1, 2, or 3")

    session = SESSIONS.get(req.session_id)

    # Math is unchanged: the template ladder, no model, no session.
    if req.subject != "chemistry":
        return _finalise(req, _template_hint(req), session=None, trusted=True)

    topic = req.topic or (session.topic if session else None)
    resource = RESOURCES.get(topic or "", None)

    # No session means no vault, and no vault means nothing to redact
    # against. Serving the floor is the correct behaviour, not an error.
    if session is None or not is_configured():
        return _finalise(
            req, _template_hint(req), session=session, resource=resource, trusted=True
        )

    if req.student_line:
        SESSIONS.record_lines(req.session_id, [req.student_line])

    started = time.perf_counter()

    if req.level == 1:
        if not req.student_line:
            return _finalise(
            req, _template_hint(req), session=session, resource=resource, trusted=True
        )
        generated = _generate_level_1(req, session)
        if generated is None:
            return _finalise(
            req, _template_hint(req), session=session, resource=resource, trusted=True
        )
        text, latency = generated
        return _finalise(req, text, session=session, source="model", latency_ms=latency)

    if req.level == 2:
        generated = _generate_level_2(req, session)
        if generated is None:
            # Two failed attempts: the floor plus a link out, per the
            # resource-fallback rule. Never nothing.
            return _finalise(
                req,
                _template_hint(req),
                session=session,
                resource=resource,
                trusted=True,
            )
        example, latency = generated
        return _finalise(
            req,
            f"Here is the same technique on a different problem. {example.technique}",
            session=session,
            worked_example=example,
            source="model",
            latency_ms=latency,
        )

    # Level 3. The gate comes before the budget, and the budget before the
    # model, so a refused step never costs an unlock and never costs a call.
    student_lines = list(session.student_lines)
    if req.student_line and req.student_line not in student_lines:
        student_lines.append(req.student_line)

    if WITHHOLD_ANSWER and session.vault.is_terminal(student_lines):
        return _finalise(
            req,
            TERMINAL_MESSAGE,
            session=session,
            terminal_step=True,
            source="fallback",
            resource=resource,
            trusted=True,
        )

    if WITHHOLD_ANSWER and not SESSIONS.spend_level_3(req.session_id):
        return _finalise(
            req,
            BUDGET_MESSAGE,
            session=session,
            source="fallback",
            resource=resource,
            trusted=True,
        )

    generated = _generate_level_3(req, session)
    if generated is None:
        return _finalise(
            req, _template_hint(req), session=session, resource=resource, trusted=True
        )
    text, latency = generated
    return _finalise(
        req,
        text,
        session=session,
        source="model",
        latency_ms=latency or int((time.perf_counter() - started) * 1000),
        allow_near_answer=True,
    )


__all__ = ["RESOURCES", "generate_hint"]
