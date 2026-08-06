"""The model path for chemistry, and the deterministic checks around it.

Only one chemistry topic needs this: organic reactions and mechanisms.
`final_tasks.md` is precise about why -- "a mechanism step is a claim about
electron movement rather than a structure comparison" -- and equally precise
that reaction *products* can often be verified deterministically once
proposed. That is the verification sandwich, and this module is it.

The order matters and is the whole safety argument:

1. Deterministic checks run **first**. A product that does not parse, or
   that is just a reactant copied down, is decided here and the model is
   never asked.
2. The model proposes a verdict on what is left.
3. The proposal is checked **again** against whatever deterministic
   expectation the reaction type carries -- the functional group the
   product must contain, the atoms the reagent must add.
4. Only the genuinely unverifiable remainder surfaces, and it surfaces
   labelled `judged_by="model"`, never dressed up as a proven verdict.

Self-consistency: the model is asked twice. Two answers that disagree
become "ask the student to confirm this line", not a confident verdict. A
wrong confident "you're right" is the failure that ends a classroom trial,
and this is the cheapest available bound on it.
"""

from __future__ import annotations

import logging

from rdkit import Chem

from model import ModelError, generate_json
from schemas import ChemistryLineVerdict, ChemistryStep
from judge.base import Judge
from judge.chemistry import (
    ChemistryParseError,
    FUNCTIONAL_GROUP_SMARTS,
    UnsupportedChemistryError,
    _canonical_smiles,
    _FUNCTIONAL_GROUP_PATTERNS,
    _parse_smiles,
    _support_reason,
)

logger = logging.getLogger(__name__)


# What a named reaction type must produce, when we can say so exactly. This
# is not a reaction predictor -- it is a list of claims a proposed product
# has to satisfy, so the model cannot approve a product that fails one.
REACTION_EXPECTATIONS: dict[str, dict] = {
    "hydration": {"requires_group": "alcohol", "adds": {"H": 2, "O": 1}},
    "hydrogenation": {"adds": {"H": 2}},
    "hydrohalogenation": {"requires_any_of": ("alkyl_halide",)},
    "oxidation_primary_alcohol": {"requires_group": "aldehyde"},
    "oxidation_secondary_alcohol": {"requires_group": "ketone"},
    "oxidation_to_acid": {"requires_group": "carboxylic_acid"},
    "reduction_ketone": {"requires_group": "alcohol", "adds": {"H": 2}},
    "reduction_aldehyde": {"requires_group": "alcohol", "adds": {"H": 2}},
    "esterification": {"requires_group": "ester", "removes": {"H": 2, "O": 1}},
    "ester_hydrolysis": {"requires_group": "carboxylic_acid"},
    "amide_formation": {"requires_group": "amide"},
    "saponification": {"requires_group": "carboxylic_acid"},
}
# Not in FUNCTIONAL_GROUP_SMARTS, and only needed to check one expectation.
_EXTRA_PATTERNS = {"alkyl_halide": Chem.MolFromSmarts("[#6][F,Cl,Br,I]")}

PROMPT_HEADER = (
    "You are the reaction-checking half of a homework tutor. You are given "
    "the starting material, the reagent or reaction type, and the product a "
    "student drew. Decide only whether the student's product is a correct "
    "product of that reaction.\n"
    "Absolute rules:\n"
    "- Never state, spell, or hint at the correct product if the student is "
    "wrong. Say only what is wrong with theirs.\n"
    "- If you are not sure, say so. 'I cannot verify this' is a correct and "
    "useful answer; a confident wrong answer is not.\n"
    "- Judge chemistry, not drawing style. Two drawings of the same molecule "
    "are the same answer.\n"
)

RESPONSE_CONTRACT = (
    "Reply with one JSON object and nothing else:\n"
    '{"verdict": "correct" | "incorrect" | "cannot_verify", '
    '"reason_category": "wrong_regiochemistry" | "wrong_stereochemistry" | '
    '"wrong_functional_group" | "wrong_skeleton" | "no_reaction" | "other", '
    '"detail": "<one sentence, naming what is wrong with the student\'s '
    'structure, never naming the correct product>"}'
)


def _atom_counts(molecule) -> dict[str, int]:
    counts: dict[str, int] = {}
    for atom in molecule.GetAtoms():
        symbol = atom.GetSymbol()
        counts[symbol] = counts.get(symbol, 0) + 1
        hydrogens = atom.GetTotalNumHs()
        if hydrogens:
            counts["H"] = counts.get("H", 0) + hydrogens
    return counts


def _has_group(molecule, group: str) -> bool:
    pattern = _FUNCTIONAL_GROUP_PATTERNS.get(group) or _EXTRA_PATTERNS.get(group)
    if pattern is None:
        return True  # nothing to check is not a failure
    return molecule.HasSubstructMatch(pattern)


def deterministic_reaction_check(
    reactants_smiles: list[str],
    product_smiles: str,
    reaction_type: str | None,
) -> ChemistryLineVerdict | None:
    """Everything about this claim that can be decided without a model.

    Returns a verdict when the claim is settled deterministically, and None
    when the remainder genuinely needs the model. A returned verdict always
    carries `judged_by="deterministic"`.
    """
    try:
        product = _parse_smiles(product_smiles)
        reason = _support_reason(product)
        if reason:
            raise UnsupportedChemistryError(reason)
    except ChemistryParseError as exc:
        return ChemistryLineVerdict(
            line_number=0, valid=False, error_type="parse_error", detail=str(exc)
        )
    except UnsupportedChemistryError as exc:
        return ChemistryLineVerdict(
            line_number=0, valid=False, error_type="unsupported", detail=str(exc)
        )

    try:
        reactants = [_parse_smiles(smiles) for smiles in reactants_smiles]
    except (ChemistryParseError, UnsupportedChemistryError) as exc:
        return ChemistryLineVerdict(
            line_number=0,
            valid=False,
            error_type="unsupported",
            detail=f"Could not read the starting material: {exc}",
        )

    product_canonical = _canonical_smiles(product)
    expectation = REACTION_EXPECTATIONS.get(reaction_type or "", {})

    # Copying the starting material down is not a product, and no model
    # needs to be consulted to know that.
    if any(_canonical_smiles(reactant) == product_canonical for reactant in reactants):
        if reaction_type == "no_reaction":
            return ChemistryLineVerdict(
                line_number=0,
                valid=True,
                detail="No reaction: the starting material is unchanged",
            )
        return ChemistryLineVerdict(
            line_number=0,
            valid=False,
            error_type="structure_mismatch",
            detail="This is the starting material unchanged, not a product",
        )

    required = expectation.get("requires_group")
    if required and not _has_group(product, required):
        return ChemistryLineVerdict(
            line_number=0,
            valid=False,
            error_type="wrong_functional_group",
            detail=f"This reaction must produce {required.replace('_', ' ')}",
        )
    for group in expectation.get("requires_any_of", ()):
        if _has_group(product, group):
            break
    else:
        if expectation.get("requires_any_of"):
            return ChemistryLineVerdict(
                line_number=0,
                valid=False,
                error_type="wrong_functional_group",
                detail="The product does not contain the group this reaction makes",
            )

    # Atom bookkeeping, where the reaction type pins it down exactly.
    delta_expected = expectation.get("adds") or {}
    removed_expected = expectation.get("removes") or {}
    if (delta_expected or removed_expected) and len(reactants) == 1:
        before = _atom_counts(reactants[0])
        after = _atom_counts(product)
        for symbol, count in delta_expected.items():
            if after.get(symbol, 0) - before.get(symbol, 0) != count:
                return ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="wrong_formula",
                    detail=(
                        f"This reaction adds {count} {symbol} to the starting "
                        "material; the product drawn does not account for that"
                    ),
                )
        for symbol, count in removed_expected.items():
            if before.get(symbol, 0) - after.get(symbol, 0) != count:
                return ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="wrong_formula",
                    detail=(
                        f"This reaction removes {count} {symbol}; the product "
                        "drawn does not account for that"
                    ),
                )

    return None


def _ask_model(
    reactants_smiles: list[str],
    reagent: str | None,
    reaction_type: str | None,
    product_smiles: str,
    *,
    temperature: float,
) -> dict:
    prompt = (
        PROMPT_HEADER
        + "\nStarting material (SMILES): "
        + " and ".join(reactants_smiles)
        + f"\nReagent or conditions: {reagent or 'not specified'}"
        + f"\nReaction type: {reaction_type or 'not specified'}"
        + f"\nStudent's product (SMILES): {product_smiles}\n\n"
        + RESPONSE_CONTRACT
    )
    payload, _ = generate_json([prompt], job="verdict", temperature=temperature)
    return payload


_CATEGORY_MAP = {
    "wrong_regiochemistry": "structure_mismatch",
    "wrong_stereochemistry": "structure_mismatch",
    "wrong_functional_group": "wrong_functional_group",
    "wrong_skeleton": "structure_mismatch",
    "no_reaction": "structure_mismatch",
    "other": "structure_mismatch",
}


def model_reaction_verdict(
    reactants_smiles: list[str],
    reagent: str | None,
    reaction_type: str | None,
    product_smiles: str,
    line_number: int,
) -> ChemistryLineVerdict:
    """Ask the model twice and only trust an answer it gives twice."""
    try:
        first = _ask_model(
            reactants_smiles,
            reagent,
            reaction_type,
            product_smiles,
            temperature=0.0,
        )
        second = _ask_model(
            reactants_smiles,
            reagent,
            reaction_type,
            product_smiles,
            temperature=0.6,
        )
    except ModelError as exc:
        logger.warning("model reaction verdict unavailable: %s", exc)
        return ChemistryLineVerdict(
            line_number=line_number,
            valid=False,
            error_type="unsupported",
            detail="This reaction could not be checked right now",
            judged_by="model",
        )

    first_verdict = str(first.get("verdict", "cannot_verify")).lower()
    second_verdict = str(second.get("verdict", "cannot_verify")).lower()

    if first_verdict != second_verdict:
        return ChemistryLineVerdict(
            line_number=line_number,
            valid=False,
            error_type="unsupported",
            detail="Two independent reads of this step disagreed",
            judged_by="model",
            needs_confirmation=True,
        )

    if first_verdict == "correct":
        return ChemistryLineVerdict(
            line_number=line_number,
            valid=True,
            detail="Checked by the model, not proven by a deterministic engine",
            judged_by="model",
        )
    if first_verdict == "cannot_verify":
        return ChemistryLineVerdict(
            line_number=line_number,
            valid=False,
            error_type="unsupported",
            detail="The model could not verify this step",
            judged_by="model",
        )

    category = str(first.get("reason_category", "other")).lower()
    return ChemistryLineVerdict(
        line_number=line_number,
        valid=False,
        error_type=_CATEGORY_MAP.get(category, "structure_mismatch"),
        detail=str(first.get("detail", ""))[:256] or "The product does not follow",
        judged_by="model",
    )


class ReactionJudge(Judge[dict, ChemistryStep, ChemistryLineVerdict]):
    """Deterministic first, model only for what is genuinely left over."""

    def check(
        self,
        problem: dict,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        reactants = list(problem.get("reactants_smiles") or [])
        reagent = problem.get("reagent")
        reaction_type = problem.get("reaction_type")
        if not reactants:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail="A reaction problem needs a starting material",
                )
            ]

        verdicts: list[ChemistryLineVerdict] = []
        for step in steps:
            settled = deterministic_reaction_check(reactants, step.smiles, reaction_type)
            if settled is not None:
                verdicts.append(settled.model_copy(update={"line_number": step.line_number}))
                continue
            verdicts.append(
                model_reaction_verdict(
                    reactants, reagent, reaction_type, step.smiles, step.line_number
                )
            )
        return verdicts


__all__ = [
    "FUNCTIONAL_GROUP_SMARTS",
    "REACTION_EXPECTATIONS",
    "ReactionJudge",
    "deterministic_reaction_check",
    "model_reaction_verdict",
]
