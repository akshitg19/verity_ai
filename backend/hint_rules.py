"""What a hint should say, per concept rather than per subject.

The level 1 prompt used to receive the subject and the topic and nothing
else, so every stoichiometry hint was written against the same coaching no
matter whether the student was finding a molar mass or a percent yield. A
hint keyed only by the topic can never be more specific than the topic, which
is the same ceiling `final_tasks.md` describes for the old template ladder,
one level up.

So each problem type declares three things:

* `points_at` -- what a level 1 hint must direct attention to on this kind of
  problem. Not the fix. The place to look.
* `common_errors` -- the mistakes that actually happen here, in the order a
  teacher would expect them. The model is told to consider these first before
  inventing an explanation, which is what stops a generic "check your
  arithmetic" on a problem whose failure mode is well known.
* `analogue` -- what a level 2 parallel problem must keep the same and what
  it must change. "Same technique, different numbers" is too loose for
  chemistry: an analogue of a polyatomic molar mass has to keep the bracket,
  or it teaches an easier problem than the one the student is stuck on.

Everything here is prose handed to a model. Nothing in this file decides
whether a student is right; the deterministic judges do that, and they are
untouched by it.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ConceptRules:
    label: str
    points_at: str
    common_errors: tuple[str, ...]
    analogue: str


# Keyed by the `task` or type id the frontend already sends.
CONCEPTS: dict[str, ConceptRules] = {
    # -- Moles and stoichiometry -------------------------------------------
    "molar_mass": ConceptRules(
        label="molar mass",
        points_at=(
            "which element's contribution is wrong, and whether every "
            "subscript, including one outside a bracket, was applied"
        ),
        common_errors=(
            "a subscript outside a bracket was not applied to everything "
            "inside it, so a polyatomic group was counted once instead of "
            "two or three times",
            "one element's atom count was read off the formula wrongly",
            "an atomic mass was recalled wrongly, most often for a metal",
            "the contributions were added up wrong",
            "only one element's contribution was given as the whole answer",
        ),
        analogue=(
            "keep a bracketed polyatomic group with a subscript outside it "
            "if the student's formula has one, because that bracket is the "
            "whole difficulty. Change the metal and the polyatomic ion."
        ),
    ),
    "percent_composition": ConceptRules(
        label="percent composition",
        points_at=(
            "whether the mass used on top is that element's total mass in "
            "the whole formula, and whether the molar mass on the bottom is "
            "the mass of the entire compound"
        ),
        common_errors=(
            "the mass of one atom was used instead of the mass of all the "
            "atoms of that element in the formula",
            "the molar mass on the bottom was wrong, usually for the same "
            "bracket reason as a molar mass problem",
            "the ratio was found but never multiplied by 100",
            "the percent of a different element was given",
        ),
        analogue=(
            "keep the same number of elements and ask for an element that "
            "appears more than once, since that is where the mistake lives"
        ),
    ),
    "moles_from_mass": ConceptRules(
        label="moles from a mass",
        points_at="whether mass was divided by molar mass, or the two were multiplied",
        common_errors=(
            "molar mass was multiplied by the mass instead of dividing into it",
            "the molar mass itself is wrong, so the division is right and "
            "the answer is not",
            "the answer was left as the molar mass rather than the moles",
            "a milligram or kilogram mass was not converted to grams",
        ),
        analogue=(
            "keep the same direction of the conversion and pick a mass that "
            "is not a whole multiple of the molar mass, so the arithmetic "
            "cannot be done by inspection"
        ),
    ),
    "mass_from_moles": ConceptRules(
        label="mass from moles",
        points_at="whether moles was multiplied by molar mass, or divided by it",
        common_errors=(
            "moles was divided by molar mass instead of multiplied",
            "the molar mass is wrong",
            "the answer given is the molar mass rather than the mass of the "
            "sample asked for",
        ),
        analogue="keep the direction and use a non-integer number of moles",
    ),
    "empirical_formula": ConceptRules(
        label="empirical formula",
        points_at=(
            "whether each mass was divided by that element's atomic mass, "
            "and whether the resulting ratio was scaled to whole numbers "
            "rather than rounded"
        ),
        common_errors=(
            "a ratio like 1 to 1.5 was rounded to 1 to 2 instead of being "
            "doubled, which is the classic wrong empirical formula",
            "the percentages were used directly as subscripts",
            "the division was by molar mass of the compound rather than by "
            "each element's atomic mass",
            "the ratio was not divided through by the smallest value",
        ),
        analogue=(
            "choose percentages that give a half-integer ratio, so the "
            "doubling step is required and the trap is preserved"
        ),
    ),
    "molecular_formula": ConceptRules(
        label="molecular formula",
        points_at=(
            "whether the empirical formula was found first, and whether the "
            "given molar mass was divided by the empirical formula mass to "
            "get a whole multiplier"
        ),
        common_errors=(
            "the empirical formula was given as the answer",
            "the multiplier was applied to only one element",
            "the multiplier was not rounded to a whole number, or was "
            "rounded when it was not close to one",
        ),
        analogue="use a multiplier of 2 or 3, never 1, or the step disappears",
    ),
    "limiting_reagent": ConceptRules(
        label="limiting reagent",
        points_at=(
            "whether each amount was converted to moles and then divided by "
            "that species' balanced coefficient before comparing"
        ),
        common_errors=(
            "the masses were compared directly, so the heavier reactant was "
            "called the excess one",
            "moles were compared without dividing by the coefficients",
            "the equation was not balanced first, so the coefficients used "
            "were wrong",
            "the limiting reagent was named as a product",
        ),
        analogue=(
            "keep coefficients that are not all 1, and choose masses where "
            "the heavier reactant is the limiting one, so comparing masses "
            "gives the wrong answer"
        ),
    ),
    "theoretical_yield": ConceptRules(
        label="theoretical yield",
        points_at=(
            "whether the moles of product came from the limiting reagent "
            "scaled by the mole ratio, and whether that was converted back "
            "to grams"
        ),
        common_errors=(
            "the excess reagent was used to find the product",
            "the mole ratio was applied upside down",
            "the answer was left in moles when grams were asked for",
            "the product's molar mass is wrong",
        ),
        analogue="keep a mole ratio that is not one to one",
    ),
    "percent_yield": ConceptRules(
        label="percent yield",
        points_at=(
            "whether actual was divided by theoretical, and whether the "
            "theoretical yield underneath is the one this reaction gives"
        ),
        common_errors=(
            "theoretical was divided by actual, giving a percentage above "
            "100",
            "the theoretical yield used is wrong, so the percentage is "
            "wrong for a reason one step earlier",
            "the ratio was not multiplied by 100",
        ),
        analogue="keep the actual yield below the theoretical one",
    ),
    # -- Solutions, acids and bases ----------------------------------------
    "molarity": ConceptRules(
        label="molarity",
        points_at="whether moles of solute was divided by volume in litres",
        common_errors=(
            "the volume was left in millilitres",
            "grams were used where moles were needed",
            "volume was divided by moles",
        ),
        analogue="give the volume in millilitres so the conversion is required",
    ),
    "dilution": ConceptRules(
        label="dilution",
        points_at="whether M1V1 was set equal to M2V2 and the right unknown solved for",
        common_errors=(
            "the two sides were mixed up, so concentration went up on "
            "dilution instead of down",
            "one volume was in millilitres and the other in litres",
        ),
        analogue="keep one volume in millilitres and one in litres",
    ),
    "strong_acid_ph": ConceptRules(
        label="the pH of a strong acid",
        points_at=(
            "whether the number of protons per formula unit was accounted "
            "for before taking the negative log"
        ),
        common_errors=(
            "the pOH was given as the pH",
            "a diprotic acid was treated as giving one H+",
            "the log was taken without the minus sign",
            "the concentration was used as the pH directly",
        ),
        analogue=(
            "use a diprotic acid if the student's was diprotic, since the "
            "factor of two is the trap"
        ),
    ),
    "strong_base_ph": ConceptRules(
        label="the pH of a strong base",
        points_at=(
            "whether pOH was found first and then subtracted from 14, and "
            "whether the hydroxides per formula unit were counted"
        ),
        common_errors=(
            "pOH was given as the answer to a pH question, which is the "
            "single most common mistake on this topic",
            "the 14 minus pOH step was skipped",
            "Ca(OH)2 was treated as giving one OH-",
        ),
        analogue="keep a base that gives two hydroxides per formula unit",
    ),
    "weak_acid_ph": ConceptRules(
        label="the pH of a weak acid",
        points_at=(
            "whether Ka was used with an ICE table rather than the acid "
            "being treated as fully dissociated"
        ),
        common_errors=(
            "the acid was treated as strong, so the pH came out far too low",
            "the square root step was skipped",
            "Ka and pKa were confused",
            "the x squared over C minus x approximation was used where it "
            "does not hold",
        ),
        analogue="keep Ka in the same order of magnitude",
    ),
    "weak_base_ph": ConceptRules(
        label="the pH of a weak base",
        points_at=(
            "whether Kb gave the hydroxide concentration, and whether pOH "
            "was then converted to pH"
        ),
        common_errors=(
            "the pOH was given as the pH",
            "Kb was used as though it were Ka",
            "the conversion through 14 was skipped",
        ),
        analogue="keep the two step shape, Kb to pOH to pH",
    ),
    "buffer_ph": ConceptRules(
        label="a buffer pH",
        points_at=(
            "whether the ratio inside the log is base over acid, and which "
            "way up the student wrote it"
        ),
        common_errors=(
            "the ratio was inverted, so the pH moved the wrong side of pKa",
            "pKa and Ka were confused",
            "moles and concentrations were mixed in the same ratio",
        ),
        analogue=(
            "choose a ratio that is not one to one, or the log term is zero "
            "and the mistake cannot show"
        ),
    ),
    "titration_concentration": ConceptRules(
        label="a titration",
        points_at=(
            "whether moles of titrant were found first, and whether the "
            "mole ratio between acid and base was applied"
        ),
        common_errors=(
            "volumes were used directly without converting to moles",
            "the one to one ratio was assumed for a diprotic acid",
            "the titrant and analyte volumes were swapped",
        ),
        analogue="keep the volumes in millilitres",
    ),
    "percent_by_mass": ConceptRules(
        label="percent by mass",
        points_at=(
            "whether the mass on the bottom is the mass of the whole "
            "solution rather than the solvent alone"
        ),
        common_errors=(
            "solute mass was divided by solvent mass instead of solution mass",
            "the result was not multiplied by 100",
        ),
        analogue="give the solvent mass rather than the solution mass",
    ),
    # -- Equations and balancing -------------------------------------------
    "balance": ConceptRules(
        label="balancing an equation",
        points_at=(
            "which element stopped matching after their last coefficient "
            "change, and the count of that element on each side"
        ),
        common_errors=(
            "a subscript was changed instead of a coefficient, which "
            "changes the substance rather than the amount",
            "fixing one element broke another that had already balanced",
            "oxygen was balanced before hydrogen and carbon in a combustion",
            "the coefficients balance but are not the lowest whole numbers",
        ),
        analogue=(
            "use a combustion or a reaction where balancing one element "
            "necessarily disturbs another, so the ordering matters"
        ),
    ),
    "net_ionic": ConceptRules(
        label="a net ionic equation",
        points_at=(
            "which species were split into ions and which stayed together, "
            "and which ions appear unchanged on both sides"
        ),
        common_errors=(
            "the solid precipitate was split into ions",
            "a spectator ion was left in the final equation",
            "a weak acid was dissociated as though it were strong",
            "charges no longer balance after cancelling",
        ),
        analogue="keep one insoluble product and at least one spectator ion",
    ),
    # -- Redox and electrochemistry ----------------------------------------
    "half_reaction": ConceptRules(
        label="balancing a half-reaction",
        points_at=(
            "whether atoms balance first, then oxygen with water, then "
            "hydrogen with H+, then charge with electrons, and where in "
            "that order it broke"
        ),
        common_errors=(
            "electrons were added to the wrong side",
            "the number of electrons does not match the change in oxidation "
            "state",
            "oxygen was balanced with O2 rather than with water",
            "the charge is balanced but the atoms are not",
        ),
        analogue=(
            "keep a species with oxygen in it, so the water and H+ steps are "
            "still needed"
        ),
    ),
    "oxidation_state": ConceptRules(
        label="an oxidation state",
        points_at=(
            "which atom the state was worked out for, what the rest of the "
            "formula contributes, and whether the total was set equal to "
            "the overall charge rather than to zero"
        ),
        common_errors=(
            "the total was set to zero on an ion that carries a charge",
            "the subscript on the element was not multiplied through, so "
            "one atom's state was used for two",
            "oxygen was taken as minus two in a peroxide",
            "hydrogen was taken as plus one in a metal hydride",
            "the sign was dropped or written the wrong way round",
        ),
        analogue=(
            "keep a polyatomic ion with a charge, so setting the sum to zero "
            "is still the trap"
        ),
    ),
    "cell_potential": ConceptRules(
        label="a standard cell potential",
        points_at=(
            "which half-reaction was taken as the cathode, and whether the "
            "anode potential was subtracted rather than added"
        ),
        common_errors=(
            "the two potentials were added instead of subtracted",
            "the anode potential was multiplied by the number of electrons, "
            "which standard potentials do not need",
            "the cathode and anode were swapped, giving the right size with "
            "the wrong sign",
            "the half-reaction was reversed but its sign was not",
        ),
        analogue="keep two metals whose potentials have opposite signs",
    ),
    # -- Structure and bonding ---------------------------------------------
    "formula_structure": ConceptRules(
        label="drawing a structure for a formula",
        points_at=(
            "which element has the wrong number of bonds in what they drew, "
            "and how many atoms of each kind their drawing actually "
            "contains compared with the formula asked for"
        ),
        common_errors=(
            "a carbon has three or five bonds rather than four",
            "the drawing has the right skeleton but one atom too many or "
            "too few",
            "an oxygen was drawn with one bond and no hydrogen",
            "a hydrogen count was left implicit where it does not follow",
        ),
        analogue=(
            "keep a formula with the same number of carbons, so the "
            "counting is the same difficulty"
        ),
    ),
    "match_structure": ConceptRules(
        label="drawing a specific structure",
        points_at=(
            "where their drawing differs from the target: which bond, "
            "between which two atoms, and whether it is a bond order or a "
            "connectivity difference"
        ),
        common_errors=(
            "a double bond was drawn as a single bond",
            "a branch was attached to the wrong carbon",
            "a ring was left open",
            "the right atoms were drawn in the wrong arrangement",
        ),
        analogue="keep the same functional group",
    ),
    "isomer": ConceptRules(
        label="drawing an isomer",
        points_at=(
            "whether what they drew has the same formula as the reference, "
            "and whether it is genuinely a different connectivity or the "
            "same molecule drawn a different way round"
        ),
        common_errors=(
            "the same molecule was redrawn rotated or flipped, which is not "
            "an isomer",
            "the formula changed, so it is a different compound rather than "
            "an isomer",
            "a carbon skeleton was branched but a hydrogen was lost in the "
            "process",
        ),
        analogue="keep a formula with at least two well known isomers",
    ),
    # -- Organic ------------------------------------------------------------
    "functional_group": ConceptRules(
        label="drawing a molecule with a given group",
        points_at=(
            "which part of their drawing was read as the group, and what "
            "the group they were asked for actually requires: which atoms, "
            "bonded how"
        ),
        common_errors=(
            "an ether was drawn where an ester was asked for, missing the "
            "carbonyl",
            "an aldehyde was drawn where a ketone was asked for, so the "
            "carbonyl is on an end carbon",
            "a carboxylic acid was drawn where an ester was asked for",
            "the group is present but the rest of the molecule is not a "
            "valid structure",
        ),
        analogue=(
            "use a group that is confused with theirs, so the difference "
            "between the two is what the example teaches"
        ),
    ),
    "naming": ConceptRules(
        label="naming a structure",
        points_at=(
            "the longest carbon chain, where the numbering starts, and "
            "which substituent sits on which carbon"
        ),
        common_errors=(
            "the longest chain was not chosen, so the parent name is wrong",
            "numbering started from the wrong end, giving higher locants",
            "the suffix does not match the functional group present",
            "substituents were not listed alphabetically",
        ),
        analogue="keep a branch that makes the numbering direction matter",
    ),
    "draw_from_name": ConceptRules(
        label="drawing a named compound",
        points_at=(
            "what the parent name fixes about the chain length, what the "
            "suffix fixes about the group, and what the locant fixes about "
            "where it sits"
        ),
        common_errors=(
            "the chain is the right length but the group is on the wrong "
            "carbon",
            "the suffix was read as a different group",
            "a prefix count was missed, so one substituent is absent",
        ),
        analogue="keep a locant that is not 1",
    ),
    "reaction": ConceptRules(
        label="predicting a product",
        points_at=(
            "which bond the reagent acts on, and what happens to it: what "
            "is added, what is removed, and at which carbon"
        ),
        common_errors=(
            "the starting material was redrawn unchanged",
            "addition happened at the wrong carbon",
            "an oxidation was taken one step too far or not far enough",
            "the reagent was treated as a different class of reagent",
        ),
        analogue="keep the same reagent class",
    ),
}


# Math has one judge and a much narrower shape, so its concepts are keyed by
# topic rather than by problem type.
MATH_CONCEPTS: dict[str, ConceptRules] = {
    "algebra": ConceptRules(
        label="algebra",
        points_at=(
            "which operation was applied to each side, and whether it was "
            "applied to every term"
        ),
        common_errors=(
            "an operation was applied to one side only",
            "a sign was dropped when moving a term across",
            "only the first term was multiplied when distributing",
            "like terms were combined wrongly",
            "an inequality was multiplied by a negative without flipping",
        ),
        analogue="keep the same number of steps and the same operation",
    ),
    "elementary": ConceptRules(
        label="arithmetic",
        points_at="which operation was performed and in what order",
        common_errors=(
            "the order of operations was not followed",
            "a negative sign was lost",
            "a fraction was added without a common denominator",
        ),
        analogue="keep the same shape and change the numbers",
    ),
}


def rules_for(problem_type: str | None, topic: str | None) -> ConceptRules | None:
    """The rules for this concept, or None if we have not written them yet.

    Falls back from the problem type to the topic rather than to a generic
    entry, because a wrong-but-confident coaching line is worse than none:
    with no rules the prompt simply carries less, and the model writes from
    the problem in front of it.
    """
    if problem_type and problem_type in CONCEPTS:
        return CONCEPTS[problem_type]
    if topic and topic in MATH_CONCEPTS:
        return MATH_CONCEPTS[topic]
    return None


def coaching_for(problem_type: str | None, topic: str | None) -> str:
    """The concept-specific part of a level 1 or level 3 prompt."""
    rules = rules_for(problem_type, topic)
    if rules is None:
        return ""
    errors = "\n".join(f"  - {error}" for error in rules.common_errors)
    return (
        f"\nThis is a {rules.label} problem.\n"
        f"Point them at: {rules.points_at}.\n"
        "On this kind of problem the mistake is usually one of these. "
        "Work out which one it is before writing anything, and if it is one "
        "of them, say which in the student's own terms:\n"
        f"{errors}\n"
        "If it is none of these, describe what they actually did instead. "
        "Do not force one of these onto work that does not fit it."
    )


def analogue_for(problem_type: str | None, topic: str | None) -> str:
    """The concept-specific constraint on a level 2 parallel problem."""
    rules = rules_for(problem_type, topic)
    if rules is None:
        return ""
    return (
        f"\nThis is a {rules.label} problem. For the parallel problem: "
        f"{rules.analogue}.\n"
        "The parallel problem must be the same difficulty, not easier. An "
        "example that removes the hard part teaches nothing about the "
        "problem they are stuck on."
    )


__all__ = [
    "CONCEPTS",
    "MATH_CONCEPTS",
    "ConceptRules",
    "analogue_for",
    "coaching_for",
    "rules_for",
]
