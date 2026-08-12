"""A bare number in the answer box is held to the quantity that was asked for.

The worst verdict this product can give is a confident valid on a wrong
line, and it was giving one on the most common mistake in the topic: 0.010 M
HCl has a pH of 2.00 and a pOH of 12.00, both members of the answer group
that redaction protects, so a student writing the bare 12.00 that the mix-up
produces was matched to the pOH step and told they were right.

Found by running every concept live. Four of the sixty questions had it.

The group is not the bug and is not removed: it is what stops a hint handing
over pOH while withholding pH. What changed is that an *unlabelled* number,
in the answer box, on a question that named its quantity, is compared with
that quantity alone. Label it and the family is open again.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from judge.solutions import SolutionsProblem, SolutionsJudge
from schemas import ChemistryStep


judge = SolutionsJudge()


def verdict(problem: SolutionsProblem, written: str, *, answers_only=True):
    steps = [ChemistryStep(line_number=1, smiles=written)]
    return judge.check(problem, steps, answers_only=answers_only)[0]


STRONG_ACID = SolutionsProblem(task="strong_acid_ph", concentration_m=0.01, protons=1)
STRONG_BASE = SolutionsProblem(
    task="strong_base_ph", concentration_m=0.01, hydroxides=1
)
WEAK_BASE = SolutionsProblem(task="weak_base_ph", concentration_m=0.1, kb=1.8e-5)


@pytest.mark.parametrize(
    "problem,written",
    [
        (STRONG_ACID, "12.00"),   # the pOH, on a question that asked for pH
        (STRONG_BASE, "2.00"),    # the pOH again, the other way round
        (WEAK_BASE, "2.87"),      # pOH from the ICE table, reported as pH
    ],
)
def test_the_pOH_is_not_accepted_as_a_bare_pH_answer(problem, written):
    assert verdict(problem, written).valid is False


@pytest.mark.parametrize(
    "problem,written",
    [
        (STRONG_ACID, "2.00"),
        (STRONG_BASE, "12.00"),
        (WEAK_BASE, "11.13"),
    ],
)
def test_the_right_answer_is_still_right(problem, written):
    assert verdict(problem, written).valid is True


@pytest.mark.parametrize("written", ["pOH = 12.00", "poh = 12.00", "pOH: 12.00"])
def test_saying_which_quantity_you_mean_reopens_the_family(written):
    """Writing pOH and meaning pOH is chemistry, not a mistake. The rule is
    about a bare number, not about the quantity."""
    assert verdict(STRONG_ACID, written).valid is True


def test_labelling_it_wrongly_is_still_wrong():
    """The label has to match the value. 'pH = 12.00' names a quantity we
    computed and gives it a different value."""
    assert verdict(STRONG_ACID, "pH = 12.00").valid is False


def test_the_working_region_is_unaffected():
    """Only the answer box is held to one quantity. A student laying out the
    working may write [H+], pOH, or anything else on the way."""
    assert verdict(STRONG_ACID, "0.010", answers_only=False).valid is True
    assert verdict(STRONG_ACID, "12.00", answers_only=False).valid is True


def test_a_question_that_asks_for_pOH_wants_the_pOH():
    problem = SolutionsProblem(
        task="poh_from_concentration", hydroxide_concentration_m=0.01
    )

    assert verdict(problem, "2.00").valid is True
    assert verdict(problem, "12.00").valid is False


def test_a_task_with_one_answer_has_no_primary_and_behaves_as_before():
    """The narrowing must not touch the twenty-odd tasks whose answer group
    has a single member."""
    from judge.solutions import solve_solutions

    solution = solve_solutions(
        SolutionsProblem(task="molarity", formula="NaCl", mass_g=5.85, volume_l=1.0)
    )

    assert solution.primary_answer is None


def test_the_intermediate_still_reports_that_it_is_not_the_answer():
    """The message matters: 'that is working, not the answer' is a different
    thing to say than 'that is wrong'."""
    outcome = verdict(STRONG_ACID, "0.010")

    assert outcome.valid is False
    assert "not the final answer" in (outcome.detail or "")
