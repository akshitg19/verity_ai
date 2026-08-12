"""The shared hint ladder.

Both math and chemistry use the same three-level tutoring pipeline:

Level 1:
    Diagnose the student's actual incorrect step.

Level 2:
    Generate a different problem using the same technique, then verify the
    worked example with the subject's deterministic engine before showing it.

Level 3:
    Walk through the student's own step, subject to the answer-vault and
    per-problem escalation rules.

Subject-specific prompts and verification engines remain separate, but every
response passes through `_finalise`, which is the single outbound redaction
chokepoint.

The old deterministic templates remain the fallback floor whenever a session
cannot be constructed, model generation fails, verification fails, or
redaction rejects generated content.
"""

from __future__ import annotations

import logging
import os
import re
import time
from collections.abc import Callable

from hint_rules import analogue_for, coaching_for
from judge.solutions import TASKS as _SOLUTIONS_TASKS
from judge.solutions import SolutionsProblem as _SolutionsProblem
from judge.stoichiometry import TASKS as _STOICHIOMETRY_TASKS
from judge.stoichiometry import StoichiometryProblem as _StoichiometryProblem
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

# The chemistry level 1 floor. Says what the checker proved and where to
# look, without numbering a row: the student laid the page out themselves.
# Anything not listed here falls through to the level 2 templates, which are
# already keyed by error type and already avoid row numbers.
_CHEMISTRY_LEVEL_1_FLOOR = {
    "wrong_value": (
        "The number in your answer isn't one this working produces. Go back "
        "through what you multiplied and what you divided, and check each "
        "quantity against where it came from."
    ),
    "wrong_unit": (
        "That value does appear in the working, but not with that unit. "
        "Write the units next to the numbers and cancel them through."
    ),
    "unbalanced_atoms": (
        "One element still has a different count on each side. Take them one "
        "element at a time and find the one that doesn't match."
    ),
    "unbalanced_charge": (
        "Every atom is accounted for, but the two sides don't carry the same "
        "total charge. Add up the charges on each side and compare them."
    ),
    "wrong_oxidation_state": (
        "Check the elements whose oxidation states are fixed by a rule "
        "first, and check what the whole species has to add up to."
    ),
    "structure_mismatch": (
        "This isn't the structure the question asks for. Go through your "
        "drawing atom by atom: which atoms are joined to which, and by what "
        "kind of bond."
    ),
}

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

    # Chemistry Resources
    "stoichiometry": "https://chem.libretexts.org/Bookshelves/General_Chemistry",
    "balancing": "https://www.khanacademy.org/science/chemistry/chemical-reactions-stoichiome",
    "redox": "https://chem.libretexts.org/Bookshelves/Analytical_Chemistry",
    "solutions": "https://www.khanacademy.org/science/chemistry/acids-and-bases-topic",
    "structure": "https://chem.libretexts.org/Bookshelves/Organic_Chemistry",
    "organic": "https://chem.libretexts.org/Bookshelves/Organic_Chemistry",

    # Math Resources
    "pre_algebra": "https://www.khanacademy.org/math/pre-algebra",
    "algebra": "https://www.khanacademy.org/math/algebra",
    "geometry": "https://www.khanacademy.org/math/geometry",
    "trigonometry": "https://www.khanacademy.org/math/trigonometry",
    "statistics": "https://www.khanacademy.org/math/statistics-probability",
    "calculus": "https://www.khanacademy.org/math/calculus-1",
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
        if req.subject == "chemistry":
            # Math is written one line under the last and our count is the
            # student's count, so naming the row there is the most useful
            # thing the floor can say. On a chemistry worksheet the working
            # is laid out however they like, in a region we do not read, and
            # "line 3" sends them counting rows that are not ours to count.
            # Better to name the mistake, which the checker already proved.
            return _CHEMISTRY_LEVEL_1_FLOOR.get(
                req.error_type, _LEVEL_2_TEMPLATES.get(req.error_type, _LEVEL_2_FALLBACK)
            )
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
def _student_page(req: HintRequest) -> str:
    """Everything the student has already written, as one string.

    Handed to redaction so a hint may quote their own work back at them. On
    the net ionic question the vault lists the complete ionic equation as an
    answer form, the student had written the complete ionic equation, and
    the level 1 hint quoting their line was thrown away for containing an
    answer. Nothing is disclosed by reading a page back to the person who
    wrote it.
    """
    parts = [req.student_line or "", req.previous_line or ""]
    parts.extend(req.working_lines or [])
    return " ".join(part for part in parts if part)


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
            text,
            vault,
            fallback,
            allow_near_answer=allow_near_answer,
            also_visible=_student_page(req),
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
_CHEMISTRY_LEVEL_1_PROMPT = (
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
    "- Point at the place by quoting what is written there, not by "
    "numbering it. 'Where you wrote minus 2 on the oxygen' tells them "
    "where to look; 'line 3' makes them count rows first, and on a page "
    "where they laid the working out themselves our numbering is not "
    "theirs. Never say 'line 3', 'the third line', or 'step 2'.\n"
    "Never do:\n"
    "- No em dashes, ever. Use a comma or a full stop.\n"
    "- No markdown, no headings, no lists, no bold.\n"
    "- No 'Great question', 'Let's', 'Remember that', 'It looks like', "
    "'It seems', 'I notice', 'Don't worry'.\n"
    "- Never state a corrected value, a corrected formula, or the answer.\n"
    "- Every number you write must already appear in the problem or in "
    "their working. You are diagnosing, not calculating: do not multiply, "
    "add, or divide anything yourself, and do not say what a quantity "
    "should come to. Naming the quantity is the hint; giving it is not.\n"
    "- Never do the step for them.\n"
    "- If their line is a drawn structure it reaches you as SMILES. That is "
    "our own code for what the recogniser read, the student has never seen "
    "it, and writing it back at them tells them nothing. Never put a SMILES "
    "string in the hint. Describe the drawing instead: how long the chain "
    "is, which atom carries what, where a group sits.\n"
    "Good: 'You balanced the hydrogens, but that changed the nitrogen count "
    "on the right. Count the nitrogens on each side and compare.'\n"
    "Bad: 'The student attempted to balance the equation by adding "
    "coefficients, but the number of atoms for at least one element is not "
    "equal on both sides.'\n"
    'Reply with JSON: {"hint": "<one or two sentences>"}'
)


_MATH_LEVEL_1_PROMPT = (
    "You are a patient math tutor sitting next to a student, looking at "
    "the one line of their written work that a deterministic checker has "
    "proven wrong.\n"
    "Say what they did on this line, what went wrong, and what they should "
    "compare with the previous line. Two sentences at most.\n"
    "How to talk:\n"
    "- Talk TO the student. Say 'you', never 'the student'.\n"
    "- Be warm, brief, and matter of fact.\n"
    "- Name the actual expressions, operations, signs, or numbers on their page.\n"
    "- Explain the mistake they made, not the entire solution method.\n"
    "- Point at the place by quoting what is written there rather than by "
    "numbering it. Never say 'line 3', 'the third line', or 'step 2'.\n"
    "Never do:\n"
    "- No markdown, headings, lists, or bold.\n"
    "- No filler such as 'Great question', 'Let's', 'Don't worry', or "
    "'Remember that'.\n"
    "- Never state the corrected line or the final answer.\n"
    "- Never perform the step for them.\n"
    "Good: 'You subtracted 12 from the left, but the right side changed by "
    "a different amount. Compare what operation you applied to each side.'\n"
    "Bad: 'Subtract 12 from both sides to get x = 17.'\n"
    'Reply with JSON: {"hint": "<one or two sentences>"}'
)


def _working_block(req: HintRequest) -> str:
    """The student's whole page, when they wrote one.

    On the numeric topics the working is laid out however the student likes
    and no single row is a claim on its own, so a hint written from one line
    can only ever say "this number is wrong". Given the whole page the model
    can say which step of their method went wrong, which is the difference
    between a useful hint and a restatement of the verdict.
    """
    lines = [line.strip() for line in (req.working_lines or []) if line.strip()]
    if not lines:
        return ""
    numbered = "\n".join(f"  {index + 1}. {line}" for index, line in enumerate(lines))
    return (
        "\nTheir whole working, as they wrote it. Read all of it before "
        "deciding what went wrong. It will not be tidy, and the steps may "
        "be in an order you would not have chosen, which is fine and is not "
        "itself a mistake:\n" + numbered + "\n"
    )


# Appended on the one retry a rejected hint gets. Each names the rule that
# was broken rather than repeating the whole prompt, because the first
# attempt is usually fluent and on topic and fails on exactly one thing.
_RETRY_LEAK = (
    "\n\nYour first attempt at this hint was thrown away because it stated a "
    "value the student is supposed to work out for themselves. Write it "
    "again without that. Every number in your hint must already appear in "
    "the problem or in their working above. Name which quantity is wrong "
    "and what to compare it against, and stop there."
)
_RETRY_POSITION = (
    "\n\nYour first attempt pointed at a row by its position. Write it again "
    "and point by quoting what is written there instead. The student laid "
    "this page out themselves, so 'the first line' and 'step 2' are our "
    "count and not theirs, and they have to go looking before they can even "
    "start. Quote three or four words of what they actually wrote."
)

# Positional pointing, in the shapes a model reaches for. Deterministic, so
# it can be checked before the hint is sent rather than hoped for in the
# prompt: five hints in sixty said "step 2" or "the first line" with the
# instruction not to sitting directly above them in the prompt.
_POSITION_RE = re.compile(
    r"\b(?:line|step|row)\s*(?:number\s*)?\d"
    r"|\b(?:first|second|third|fourth|fifth|next|last|final)\s+(?:line|row|step)\b",
    re.IGNORECASE,
)

_RETRY_SMILES = (
    "\n\nYour first attempt wrote the SMILES string out in the hint. The "
    "student drew a picture. SMILES is our own code for what the recogniser "
    "read and they have never seen it, so it tells them nothing. Write it "
    "again describing the drawing in words: how long the chain is, which "
    "atom carries what, where a group sits. Never put a SMILES string in a "
    "hint."
)

# Topics where the student's line is a drawing that reaches us as SMILES.
_STRUCTURE_TOPICS = frozenset({"structure", "organic"})


def _points_by_position(text: str) -> bool:
    return bool(_POSITION_RE.search(text or ""))


def _shows_smiles(text: str, req: HintRequest) -> bool:
    """Whether a hint writes our internal notation out at a person.

    Found live on the structure topics: the student drew a five carbon
    chain, the recogniser read it as CCCCC, and the hint said "You drew
    CCCCC". They never wrote that and would not recognise it, which is the
    standing rule that SMILES is for the machine and the right panel and
    never for the page.

    Checked against their own line rather than by pattern, because a general
    SMILES detector fires on H2SO4 and on [OH-], and both of those are just
    chemistry.
    """
    line = (req.student_line or "").strip()
    if len(line) < 2 or (req.topic or "") not in _STRUCTURE_TOPICS:
        return False
    return (
        re.search(
            r"(?<![A-Za-z0-9])" + re.escape(line) + r"(?![A-Za-z0-9])", text or ""
        )
        is not None
    )


def _retried_once(
    generate: Callable[..., tuple[str, int] | None],
    first: tuple[str, int],
    level: int,
    *,
    broken: Callable[[str], bool],
    note: str,
    why: str,
) -> tuple[str, int]:
    """One more ask when a hint breaks a rule we can check, then take what we get.

    Deliberately not a fallback to the template: "in the first line you wrote
    53.96" is worse than quoting the work and much better than a sentence
    that would fit any problem. The retry is worth one call; giving up the
    whole hint is not.
    """
    if not broken(first[0]):
        return first
    logger.warning("level %d %s, asking once more", level, why)
    again = generate(retry=note)
    if again is not None and again[0] and not broken(again[0]):
        return again
    return first


def _cleaned_up(
    generate: Callable[..., tuple[str, int] | None],
    first: tuple[str, int],
    level: int,
    req: HintRequest,
) -> tuple[str, int]:
    """Both rules we can check on the text itself, before it is sent."""
    result = _retried_once(
        generate,
        first,
        level,
        broken=lambda text: _shows_smiles(text, req),
        note=_RETRY_SMILES,
        why="wrote a SMILES at the student",
    )
    return _retried_once(
        generate,
        result,
        level,
        broken=_points_by_position,
        note=_RETRY_POSITION,
        why="pointed by position",
    )


def _generate_level_1(
    req: HintRequest,
    session: ProblemSession,
    *,
    retry: str | None = None,
) -> tuple[str, int] | None:
    base_prompt = (
        _CHEMISTRY_LEVEL_1_PROMPT
        if req.subject == "chemistry"
        else _MATH_LEVEL_1_PROMPT
    )

    prompt = (
        base_prompt
        + (retry or "")
        + coaching_for(req.problem_type, req.topic or session.topic)
        + f"\n\nTopic: {req.topic or session.topic}"
        + f"\nProblem: {req.problem or session.problem}"
        + f"\nThe line before: {req.previous_line or '(this is the first line)'}"
        + f"\nThe flagged line (line {req.line_number}): {req.student_line}"
        + _working_block(req)
        + f"\nWhat the checker proved: {req.error_type}"
    )

    try:
        payload, latency = generate_json(
            [prompt],
            job="hint",
            temperature=0.2,
        )
    except ModelError as exc:
        logger.warning("level 1 generation failed: %s", exc)
        return None

    hint = str(payload.get("hint", "")).strip()
    return (hint, latency) if hint else None


# ---------------------------------------------------------------------------
# Level 2: a generated parallel problem, verified before it is shown.
# ---------------------------------------------------------------------------
_CHEMISTRY_LEVEL_2_PROMPT = (
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


_MATH_LEVEL_2_PROMPT = (
    "You are a math tutor at a whiteboard. A student is stuck on an algebra "
    "problem. Create a DIFFERENT one-variable algebra problem that uses the "
    "same technique and contains the same kind of mistake, but uses different "
    "numbers from the student's problem.\n"
    "Then work the new problem correctly.\n"
    "Rules:\n"
    "- The new problem must be a one-variable algebra equation supported by "
    "a basic algebra checker.\n"
    "- Do not reuse the student's numbers.\n"
    "- `problem` must contain only the mathematical equation.\n"
    "- Every item in `steps` must contain only a complete mathematical "
    "equation, with no explanatory prose.\n"
    "- Every step must be mathematically equivalent to the step before it.\n"
    "- The last step should solve the new problem.\n"
    "- `technique` should name the general technique in one short sentence.\n"
    "Reply with one JSON object and nothing else."
)


def _numeric_contract(tasks, problem_class, answer_note: str) -> str:
    """Build the `check` contract from the dataclass that has to accept it.

    Hand-written, these two drifted. The stoichiometry list was missing
    `molecular_formula` entirely and the solutions list was missing
    `titrant_concentration_m`, `titrant_volume_l`, `analyte_volume_l`,
    `protons` and `hydroxides`, so on those tasks the model was asked to
    describe its own problem in a vocabulary that had no words for it, and
    the example it invented failed verification every time. That was five of
    the twenty level 2 fallbacks in a live run of all thirty concepts.

    Deriving it means a task or a field added to the judge cannot silently
    become a task level 2 can never verify.
    """
    from dataclasses import fields

    names = [
        field.name
        for field in fields(problem_class)
        if field.name not in ("task", "steps")
    ]
    return (
        '"check": {"task": "<one of: ' + ", ".join(tasks) + '>", '
        '"params": {<the inputs your problem gives, using only these field '
        "names: " + ", ".join(names) + ">}, "
        '"answer": <' + answer_note + ">}\n"
        "Every value in `params` is a plain JSON number with no unit and no "
        "quotes, except formula, element, equation and product, which are "
        "strings. `amounts` and `composition` map a formula to a plain "
        "number: {\"N2\": 28.0, \"H2\": 6.0}, never to an object and never "
        "to a string. Volumes are in litres and masses in grams."
    )


# `smiles` is parsed by RDKit and rejected if it does not parse, and the
# common failure was a condensed formula written where a SMILES was asked
# for: CC(Cl)CH2Cl is how a person writes it and is not a SMILES, so RDKit
# refused it and the student got the static floor. The example spells out
# the difference rather than trusting the word "SMILES" to carry it.
_STRUCTURE_CONTRACT = (
    '"check": {"smiles": "<the answer structure as a valid SMILES string>", '
    '"group": "<the functional group it contains, or null>"}\n'
    "`smiles` must be real SMILES that a parser accepts, not a condensed "
    "formula. 1,2-dichloropropane is CC(Cl)CCl, never CC(Cl)CH2Cl. Ethanol "
    "is CCO, never CH3CH2OH. It is read by a machine and never shown to the "
    "student, so write it for the parser and keep the condensed formulas "
    "for the steps, where a person will read them."
)


_CHEMISTRY_CHECK_CONTRACTS = {
    "balancing": (
        "If your problem is to balance an equation:\n"
        '"check": {"unbalanced": "<your equation, coefficients omitted>", '
        '"balanced": "<the same equation, fully balanced>"}\n'
        "If your problem is to write a net ionic equation:\n"
        '"check": {"molecular": "<your full molecular equation>", '
        '"net_ionic": "<the net ionic form of it>"}\n'
        "Use the shape that matches the question you invented, and make the "
        "last step of your working state the same equation the check does."
    ),
    "stoichiometry": _numeric_contract(
        _STOICHIOMETRY_TASKS,
        _StoichiometryProblem,
        "the final numeric answer, or the formula or species as a string",
    ),
    "solutions": _numeric_contract(
        _SOLUTIONS_TASKS, _SolutionsProblem, "the final numeric answer"
    ),
    "redox": (
        '"check": {"formula": "<the species>", "element": "<element symbol>", '
        '"answer": <the oxidation state as a number>}'
    ),
    "structure": _STRUCTURE_CONTRACT,
    "organic": _STRUCTURE_CONTRACT,
}


def _level_2_prompt(
    subject: str,
    topic: str,
    problem: str,
    error_type: str | None,
    problem_type: str | None = None,
) -> str:
    if subject == "math":
        return (
            _MATH_LEVEL_2_PROMPT
            + analogue_for(problem_type, topic)
            + f"\n\nTopic: {topic}"
            + f"\nThe student's problem, which must NOT be reused: {problem}"
            + f"\nThe mistake they made: {error_type}\n\n"
            + "Reply with exactly this JSON shape:\n"
            + '{"problem": "<new equation>", '
            + '"technique": "<technique in one sentence>", '
            + '"steps": ["<equation 1>", "<equation 2>", "..."], '
            + '"check": {}}'
        )

    contract = _CHEMISTRY_CHECK_CONTRACTS.get(
        topic,
        _CHEMISTRY_CHECK_CONTRACTS["structure"],
    )

    return (
        _CHEMISTRY_LEVEL_2_PROMPT
        + analogue_for(problem_type, topic)
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


def _verify_example(subject: str,topic: str, payload: dict, student_problem: str) -> WorkedExample | None:
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
        logger.warning("level 2 rejected: the payload has no problem, technique or steps")
        return None
    steps = [str(step).strip() for step in raw_steps if str(step).strip()]
    if not 1 <= len(steps) <= 20 or not isinstance(check, dict):
        logger.warning(
            "level 2 rejected: %d steps and check is %s",
            len(steps),
            type(check).__name__,
        )
        return None

    # The similarity guard, asserted mechanically rather than requested in
    # the prompt: an analogue that reuses the student's numbers is the
    # student's problem wearing a hat.
    if not numbers_differ(problem, student_problem):
        logger.warning("level 2 rejected: analogue reuses the student's numbers")
        return None

    if subject == "math":
        if topic != "algebra":
            logger.warning(
                "level 2 rejected: no deterministic math verifier for topic %s",
                topic,
            )
            return None

        if not _verify_math_example(problem, steps):
            return None

    else:
        if not _check_is_correct(topic, check, steps):
            return None

    return WorkedExample(
        problem=problem,
        technique=technique,
        steps=steps,
        verified=True,
        equations=(
            [_step_equation(step) for step in steps]
            if subject == "chemistry"
            else []
        ),
        quantities=[_step_quantity(step) for step in steps],
        # Only where the answer genuinely is a molecule. Taken from the
        # machine-checkable spec the model returned and which our own judge
        # has just verified, never from the prose.
        structure=(
            str(check.get("smiles") or "").strip() or None
            if topic in ("structure", "organic")
            else None
        ),
    )


def _step_quantity(step: str):
    """The single quantity a worked step states, or None.

    Same argument as `_step_equation`: our parser, not the client's regex.
    A step with two numbers in it is working rather than a claim, and
    `parse_quantity` refuses it, which is exactly the answer we want here.
    """
    from judge.quantities import QuantityParseError, format_quantity, parse_quantity
    from schemas import ExampleQuantity

    text = step.split(":")[-1].strip() if ":" in step else step
    for candidate in (text, step):
        try:
            quantity = parse_quantity(candidate)
        except QuantityParseError:
            continue
        return ExampleQuantity(
            value=quantity.value,
            unit=quantity.unit,
            label=quantity.name,
            text=format_quantity(quantity),
        )
    return None


# ---------------------------------------------------------------------------
# Pulling the equation out of a step, with our own parser rather than the
# client's.
#
# A step reads "Balance the oxygens last: C3H8 + 5O2 -> 3CO2 + 4H2O". The
# client used to find the equation in that by keeping any word starting with a
# capital, which tallied "Balance" as an element. Doing it here means the one
# parser that already decides whether a student's line balances is also the
# one that decides what the animation counts, and a step this cannot read
# comes back as null instead of a wrong tally.
# ---------------------------------------------------------------------------


def _step_equation(step: str) -> str | None:
    from judge.chemistry_equations import (
        EQUATION_SEPARATORS,
        EquationParseError,
        parse_equation,
    )

    text = step.strip()
    separator = next((s for s in EQUATION_SEPARATORS if s in text), None)
    if separator is None:
        return None

    left, _, right = text.partition(separator)
    left_terms = _formula_run(left, from_end=True)
    right_terms = _formula_run(right, from_end=False)
    if not left_terms or not right_terms:
        return None

    equation = f"{' + '.join(left_terms)} -> {' + '.join(right_terms)}"
    try:
        parse_equation(equation)
    except EquationParseError:
        return None
    return equation


def _formula_run(side: str, *, from_end: bool) -> list[str]:
    """The run of real formula terms at one end of a side, prose trimmed off."""
    from judge.chemistry_equations import EquationParseError, parse_formula

    def readable(term: str) -> str | None:
        # A term is either a formula already, or a sentence with the formula at
        # the end it faces: prose runs up to the equation on the left of the
        # arrow and away from it on the right. Anything else ends the run.
        words = term.split()
        salvage = (words[-1] if from_end else words[0]) if words else ""
        for candidate in (term, salvage):
            cleaned = candidate.strip().strip(".,;:!?")
            if not cleaned:
                continue
            body = cleaned.lstrip("0123456789")
            if not body:
                continue
            try:
                parse_formula(body)
            except EquationParseError:
                continue
            return cleaned
        return None

    terms = [term.strip() for term in _split_on_term_plus(side) if term.strip()]
    ordered = list(reversed(terms)) if from_end else terms

    run: list[str] = []
    for term in ordered:
        readable_term = readable(term)
        if readable_term is None:
            break
        run.append(readable_term)
    return list(reversed(run)) if from_end else run


def _split_on_term_plus(side: str) -> list[str]:
    """Split on "+", leaving a charge sign attached to its ion."""
    terms: list[str] = []
    current: list[str] = []
    for character in side:
        if character == "+" and not re.search(r"\^\d*$", "".join(current)):
            terms.append("".join(current))
            current = []
            continue
        current.append(character)
    terms.append("".join(current))
    return terms


def _verify_math_example(problem: str, steps: list[str]) -> bool:
    """Verify a generated math example with the same judge used on students."""
    from judge.algebra import AlgebraJudge
    from schemas import Step

    if not problem or not steps:
        logger.warning("level 2 rejected: the example has no problem or no steps")
        return False

    judge = AlgebraJudge()

    check_steps = [
        Step(
            line_number=index + 1,
            latex=text,
        )
        for index, text in enumerate(steps)
    ]

    verdicts = judge.check(problem, check_steps)

    if not verdicts:
        logger.warning("level 2 rejected: the algebra judge returned nothing")
        return False

    # line 0 means the generated problem itself could not be safely judged.
    if verdicts[0].line_number == 0:
        logger.warning(
            "level 2 rejected: the generated problem itself is %s",
            verdicts[0].error_type,
        )
        return False

    wrong = [verdict for verdict in verdicts if not verdict.valid]
    if wrong:
        logger.warning(
            "level 2 rejected: line %d of the worked example is %s",
            wrong[0].line_number,
            wrong[0].error_type,
        )
        return False
    return True


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
        logger.warning("level 2 verification raised, rejecting example: %s", exc)
        return False


def _reject(why: str, *args) -> bool:
    """Say no, and say why.

    Every rejection below used to be a bare `return False`. Level 2 was the
    most common failure in the ladder and the server could not name a single
    reason for it: the live audit could see the floor being served on nine
    questions and the log had one line for one of them. A verifier that
    cannot explain itself cannot be improved, only guessed at.
    """
    logger.warning("level 2 rejected: " + why, *args)
    return False


def _verify_net_ionic(check: dict, steps: list[str]) -> bool:
    """A net ionic example ends at the net ionic equation, not the molecular one.

    Both problem types live under the balancing topic, so both were being
    handed to `_verify_balancing`, which demands the last steps restate the
    balanced *molecular* equation. A correct net ionic example ends at
    "3Ag^+ + PO4^3- -> Ag3PO4" and was thrown away every time. The check
    contract only had the balancing shape too, so the model filled
    `unbalanced` and `balanced` with whatever it had, sometimes the
    student's own equation.
    """
    from judge.net_ionic import net_ionic_equation

    molecular = str(check.get("molecular", "")).strip()
    claimed = str(check.get("net_ionic", "")).strip()
    if not molecular or not claimed:
        return _reject("the check gave no molecular or no net ionic equation")

    result = net_ionic_equation(molecular)
    if result.no_reaction:
        return _reject("%r has no net ionic equation, everything cancels", molecular)
    if not _same_equation(claimed, result.net_ionic):
        return _reject(
            "the example calls %r the net ionic form of %r, we get %r",
            claimed,
            molecular,
            result.net_ionic,
        )
    if not any(_same_equation(step, result.net_ionic) for step in steps[-3:]):
        return _reject("the last steps never arrive at %r", result.net_ionic)
    return True


def _verify_balancing(check: dict, steps: list[str]) -> bool:
    from judge.chemistry_equations import balance_coefficients, is_balanced, parse_equation

    # Net ionic problems share this topic and are a different question.
    if check.get("net_ionic") or check.get("molecular"):
        return _verify_net_ionic(check, steps)

    unbalanced = str(check.get("unbalanced", "")).strip()
    balanced = str(check.get("balanced", "")).strip()
    if not unbalanced or not balanced:
        return _reject("the check gave no unbalanced or no balanced equation")
    if not is_balanced(balanced):
        return _reject("the equation it calls balanced is not balanced: %r", balanced)
    # The balanced form must be the balanced form *of that equation*, not of
    # some other reaction the model drifted into.
    left, right = parse_equation(balanced)
    correct_left, correct_right = balance_coefficients(unbalanced)
    written = [c for c, _ in left + right]
    if written != correct_left + correct_right:
        return _reject(
            "the coefficients %s are not the ones %r balances to", written, unbalanced
        )
    # And the worked steps must actually end at it.
    if not any(_same_equation(step, balanced) for step in steps[-3:]):
        return _reject("the last steps never arrive at %r", balanced)
    return True


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
        return _reject("the check answer is not a number: %r", expected)
    # Any member of the answer group counts: a pH problem's answer is as
    # legitimately stated as pOH or [H+], and the generated example is
    # allowed to end on whichever the question it invented asked for.
    if not any(
        values_match(step.quantity.value, float(expected), sig_figs=3)
        for step in solution.answer_steps
    ):
        return _reject(
            "the example answers %s, our solver gets %s",
            expected,
            [round(step.quantity.value, 4) for step in solution.answer_steps],
        )

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
            return _reject("step %r contradicts our solution", step)
    return True


def _verify_stoichiometry(check: dict, steps: list[str]) -> bool:
    from judge.stoichiometry import StoichiometryProblem, solve_stoichiometry

    params = dict(check.get("params") or {})
    task = str(check.get("task", ""))
    solution = solve_stoichiometry(
        StoichiometryProblem(task=task, **_filtered(params, StoichiometryProblem))
    )
    if solution.formula_answer or solution.species_answer:
        from judge.stoichiometry import _formula_matches

        expected = str(check.get("answer", "")).strip()
        symbolic = solution.formula_answer or solution.species_answer
        # By element counts, the way the student's own answer is compared.
        # A string compare rejected an example answering S2O3 because our
        # solver writes O3S2, which is the same compound spelled the other
        # way round. The student was never held to that and neither should
        # a worked example be.
        if not expected or not _formula_matches(expected, symbolic):
            return _reject(
                "the example answers %r, our solver gets %r", expected, symbolic
            )
        return True
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
        return _reject(
            "the check needs a formula, an element and a numeric answer, got %r",
            check,
        )
    actual = float(oxidation_state(formula, element))
    if actual != float(expected):
        return _reject(
            "the example says %s for %s in %s, we get %s",
            expected, element, formula, actual,
        )
    return True


def _verify_structure(check: dict, steps: list[str]) -> bool:
    from judge.chemistry import (
        _parse_smiles,
        _support_reason,
        group_pattern,
    )

    smiles = str(check.get("smiles", "")).strip()
    if not smiles:
        return _reject("the check carries no structure")
    molecule = _parse_smiles(smiles)
    reason = _support_reason(molecule)
    if reason:
        return _reject("we cannot read %r as a structure: %s", smiles, reason)
    group = check.get("group")
    if group:
        pattern = group_pattern(str(group))
        if pattern is None:
            return _reject("we have no pattern for the group %r", group)
        if not molecule.HasSubstructMatch(pattern):
            return _reject("%r does not contain a %s", smiles, group)
    return True


def _as_number(value):
    """A number out of whatever shape the model wrote it in, or None.

    Accepts "28.0", "28.0 g", and {"mass_g": 28.0}, because all three mean
    twenty eight grams and none of them are worth throwing a worked example
    away over. Found live, and it was invisible: the verifier crashed on
    `'<' not supported between instances of 'dict' and 'dict'` and on
    `unsupported operand type(s) for /: 'str' and 'float'`, both of which
    were caught as "verification failed" and served the student the floor.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", value)
        return float(match.group(0)) if match else None
    if isinstance(value, dict):
        for candidate in value.values():
            number = _as_number(candidate)
            if number is not None:
                return number
    return None


# Fields whose value is a mapping of species to an amount, rather than one
# number. The values inside need the same coercion as everything else.
_MAPPING_FIELDS = ("amounts", "composition")


def _filtered(params: dict, model_class) -> dict:
    """Keep the fields the dataclass has, in the types it can actually use.

    Forgiving on purpose. The check object describes the *example's* own
    problem, so a number written as a string is a JSON style difference and
    nothing more; being strict about it costs a student their hint and
    protects nobody.
    """
    allowed = {
        field
        for field in model_class.__dataclass_fields__  # type: ignore[attr-defined]
        if field != "task"
    }
    cleaned: dict = {}
    for key, value in params.items():
        if key not in allowed:
            continue
        if key in _MAPPING_FIELDS:
            if not isinstance(value, dict):
                continue
            mapped = {
                str(species): _as_number(amount)
                for species, amount in value.items()
            }
            cleaned[key] = {
                species: amount
                for species, amount in mapped.items()
                if amount is not None
            }
            continue
        if isinstance(value, str) and key not in ("formula", "element",
                                                  "equation", "product"):
            number = _as_number(value)
            if number is not None:
                cleaned[key] = number
                continue
        cleaned[key] = value
    return cleaned


def _generate_level_2(
    req: HintRequest, session: ProblemSession
) -> tuple[WorkedExample, int] | None:
    topic = req.topic or session.topic
    problem = req.problem or session.problem
    total_latency = 0
    for attempt in range(MAX_GENERATION_ATTEMPTS):
        try:
            payload, latency = generate_json(
                [
                    _level_2_prompt(
                        req.subject,
                        topic,
                        problem,
                        req.error_type,
                        req.problem_type,
                    )
                ],
            )
        except ModelError as exc:
            logger.warning("level 2 generation failed: %s", exc)
            return None
        total_latency += latency
        example = _verify_example(
            req.subject,
            topic,
            payload,
            problem,
        )
        if example is not None:
            return example, total_latency
        logger.warning("level 2 example failed verification, attempt %d", attempt + 1)
    return None


# ---------------------------------------------------------------------------
# Level 3: their own step, with the gate.
# ---------------------------------------------------------------------------
_CHEMISTRY_LEVEL_3_PROMPT = (
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
    "- Refer to their working by quoting it back, never by row number. "
    "They laid the page out themselves and our numbering is not theirs.\n"
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
_CHEMISTRY_LEVEL_3_PROMPT_OPEN = (
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
    "- Refer to their working by quoting it back, never by row number. "
    "They laid the page out themselves and our numbering is not theirs.\n"
    "- Finish the step. Show the value or the line it comes out at, and say "
    "in one clause why that is the result.\n"
    "Never do:\n"
    "- No em dashes, ever. Use a comma or a full stop.\n"
    "- No markdown, no headings, no lists, no bold.\n"
    "- No 'Great question', 'Let's dive in', 'Remember that', 'Don't "
    "worry', 'As you can see'.\n"
    "- If their line is a drawn structure it reaches you as SMILES. That is "
    "our own code for what the recogniser read, the student has never seen "
    "it, and 'you drew CCCCC' means nothing to someone who drew a chain of "
    "five carbons. Never put a SMILES string in the hint. Describe the "
    "drawing instead.\n"
    "- Do this one step. Do not solve the rest of the problem for them.\n"
    "Length: three to five sentences.\n"
    'Reply with JSON: {"hint": "<three to five sentences>", "declined": false}'
)

_MATH_LEVEL_3_PROMPT = (
    "You are a patient math tutor working through one incorrect line with "
    "a student. Reason through THEIR step with them, up to but not including "
    "the final answer to the overall problem.\n"
    "Explain what operation is appropriate, why, and what they should check.\n"
    "Talk directly to the student using 'you' and 'we'.\n"
    "Use the actual expressions and numbers on their page.\n"
    "Do not solve later steps.\n"
    "Do not state the final answer.\n"
    "No markdown, headings, lists, praise, or filler.\n"
    "Length: three or four sentences.\n"
    'If you cannot help without revealing the answer, reply with '
    '{"declined": true} and nothing else.\n'
    'Reply with JSON: {"hint": "<three or four sentences>", "declined": false}'
)


_MATH_LEVEL_3_PROMPT_OPEN = (
    "You are a patient math tutor working through one incorrect line with "
    "a student. Take THEIR step and reason it all the way through until that "
    "single step is finished.\n"
    "Talk directly to the student using 'you' and 'we'.\n"
    "Use the actual expressions and numbers on their page.\n"
    "Finish this one step, but do not continue solving the rest of the problem.\n"
    "No markdown, headings, lists, praise, or filler.\n"
    "Length: three to five sentences.\n"
    'Reply with JSON: {"hint": "<three to five sentences>", "declined": false}'
)


def _generate_level_3(
    req: HintRequest,
    session: ProblemSession,
    *,
    retry: str | None = None,
) -> tuple[str, int] | None:
    if req.subject == "chemistry":
        base_prompt = (
            _CHEMISTRY_LEVEL_3_PROMPT
            if WITHHOLD_ANSWER
            else _CHEMISTRY_LEVEL_3_PROMPT_OPEN
        )
    else:
        base_prompt = (
            _MATH_LEVEL_3_PROMPT
            if WITHHOLD_ANSWER
            else _MATH_LEVEL_3_PROMPT_OPEN
        )

    prompt = (
        base_prompt
        + (retry or "")
        + coaching_for(req.problem_type, req.topic or session.topic)
        + f"\n\nTopic: {req.topic or session.topic}"
        + f"\nProblem: {req.problem or session.problem}"
        + f"\nThe line before: {req.previous_line or '(this is the first line)'}"
        + f"\nTheir line (line {req.line_number}): {req.student_line}"
        + _working_block(req)
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

    # A session created for one topic must never be reused for another.
    if session is not None and req.topic is not None and session.topic != req.topic:
        session = None

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
        text, latency = _cleaned_up(
            lambda retry: _generate_level_1(req, session, retry=retry),
            generated,
            1,
            req,
        )
        answer = _finalise(
            req, text, session=session, source="model", latency_ms=latency
        )
        if answer.source == "model":
            return answer
        # Redaction threw it away, which means the model stated a value it
        # was told not to state. The filter did its job and the student is
        # now looking at the static floor for a reason that has nothing to do
        # with them. Level 2 already regenerates once when verification
        # fails; this is the same trade on the same grounds.
        retried = _generate_level_1(req, session, retry=_RETRY_LEAK)
        if retried is None:
            return answer
        text, latency = retried
        second = _finalise(
            req, text, session=session, source="model", latency_ms=latency
        )
        return second if second.source == "model" else answer

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
    text, latency = _cleaned_up(
        lambda retry: _generate_level_3(req, session, retry=retry),
        generated,
        3,
        req,
    )
    return _finalise(
        req,
        text,
        session=session,
        source="model",
        latency_ms=latency or int((time.perf_counter() - started) * 1000),
        allow_near_answer=True,
    )


__all__ = ["RESOURCES", "generate_hint"]
