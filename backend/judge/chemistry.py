from rdkit import Chem

from schemas import ChemistryLineVerdict, ChemistryStep
from .base import Judge


MAX_SMILES_LENGTH = 2_048
SUPPORTED_ATOMIC_NUMBERS = {
    6,   # C
    7,   # N
    8,   # O
    9,   # F
    15,  # P
    16,  # S
    17,  # Cl
    35,  # Br
    53,  # I
}
SUPPORTED_BOND_TYPES = {
    Chem.BondType.SINGLE,
    Chem.BondType.DOUBLE,
    Chem.BondType.TRIPLE,
    Chem.BondType.AROMATIC,
}

# Each pattern must match its own group and reject the groups it is most
# easily confused with, because a student asked for "ester" who draws an
# ether has to get `wrong_functional_group`, not a false pass. The
# exclusions carry that weight: an ester's single-bonded oxygen is also a
# two-carbon oxygen, so `ether` has to rule out an adjacent carbonyl, and
# an amide nitrogen is also a trivalent nitrogen, so `amine` has to rule
# out an adjacent carbonyl too.
FUNCTIONAL_GROUP_SMARTS: dict[str, str] = {
    "ester": "[CX3](=[OX1])[OX2H0][#6]",
    "ether": "[OX2D2;!$([OX2][CX3]=[OX1])]([#6])[#6]",
    "alcohol": "[#6X4][OX2H1]",
    "ketone": "[#6][CX3](=[OX1])[#6]",
    "aldehyde": "[CX3H1](=[OX1])[#6]",
    "carboxylic_acid": "[CX3](=[OX1])[OX2H1]",
    "amine": "[NX3;H0,H1,H2;!$([NX3][CX3]=[OX1]);!$([NX3+])]",
    "amide": "[NX3][CX3](=[OX1])",
}
_FUNCTIONAL_GROUP_PATTERNS: dict[str, Chem.Mol] = {
    name: Chem.MolFromSmarts(smarts)
    for name, smarts in FUNCTIONAL_GROUP_SMARTS.items()
}
_UNCOMPILED_GROUPS = sorted(
    name for name, pattern in _FUNCTIONAL_GROUP_PATTERNS.items() if pattern is None
)
if _UNCOMPILED_GROUPS:
    raise RuntimeError(
        "invalid functional group SMARTS: " + ", ".join(_UNCOMPILED_GROUPS)
    )


class ChemistryParseError(ValueError):
    """The supplied text is not a valid SMILES molecule."""


class UnsupportedChemistryError(ValueError):
    """The SMILES parses but is outside the deliberately narrow MVP scope."""


def _parse_smiles(smiles: str):
    if not isinstance(smiles, str) or not smiles.strip():
        raise ChemistryParseError("SMILES must be a non-empty string")
    if len(smiles) > MAX_SMILES_LENGTH:
        raise ChemistryParseError(
            f"SMILES must be at most {MAX_SMILES_LENGTH} characters"
        )
    if ">" in smiles:
        raise UnsupportedChemistryError(
            "reaction SMILES are outside the molecular-structure scope"
        )

    try:
        molecule = Chem.MolFromSmiles(smiles)
    except Exception as exc:
        raise ChemistryParseError("SMILES could not be parsed") from exc
    if molecule is None:
        raise ChemistryParseError("SMILES could not be parsed")
    return molecule


def _support_reason(molecule) -> str | None:
    if len(Chem.GetMolFrags(molecule)) != 1:
        return "only one connected molecule is supported"

    for atom in molecule.GetAtoms():
        if atom.GetAtomicNum() == 0:
            return "wildcard atoms are not supported"
        if atom.GetAtomicNum() not in SUPPORTED_ATOMIC_NUMBERS:
            return "this element is outside the supported organic scope"
        if atom.GetIsotope():
            return "isotopes are not supported"
        if atom.GetAtomMapNum():
            return "atom-mapped structures are not supported"

    for bond in molecule.GetBonds():
        if bond.GetBondType() not in SUPPORTED_BOND_TYPES:
            return "this bond type is not supported"

    return None


def _canonical_smiles(molecule) -> str:
    """A deterministic graph representation that preserves stereochemistry."""
    return Chem.MolToSmiles(
        molecule,
        canonical=True,
        isomericSmiles=True,
        allHsExplicit=False,
        allBondsExplicit=False,
    )


class ChemistryJudge(Judge[str, ChemistryStep, ChemistryLineVerdict]):
    """Compares each submitted molecular structure with one target molecule.

    This is intentionally not a reaction or mechanism checker. Each line is a
    candidate drawing of the target, so an invalid candidate does not change
    the reference used for later lines.
    """

    def check(
        self,
        target_smiles: str,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        try:
            target = _parse_smiles(target_smiles)
            target_support_reason = _support_reason(target)
            if target_support_reason:
                raise UnsupportedChemistryError(target_support_reason)
            target_canonical = _canonical_smiles(target)
        except UnsupportedChemistryError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported target structure: {exc}",
                )
            ]
        except ChemistryParseError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse target structure: {exc}",
                )
            ]
        except Exception:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail="Target structure could not be checked safely",
                )
            ]

        verdicts: list[ChemistryLineVerdict] = []
        for step in steps:
            try:
                submitted = _parse_smiles(step.smiles)
                support_reason = _support_reason(submitted)
                if support_reason:
                    raise UnsupportedChemistryError(support_reason)
                submitted_canonical = _canonical_smiles(submitted)
            except UnsupportedChemistryError as exc:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail=str(exc),
                    )
                )
                continue
            except ChemistryParseError as exc:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=str(exc),
                    )
                )
                continue
            except Exception:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail="Submitted structure could not be checked safely",
                    )
                )
                continue

            matches_target = submitted_canonical == target_canonical
            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=matches_target,
                    error_type=None if matches_target else "structure_mismatch",
                    detail=(
                        None
                        if matches_target
                        else "Submitted structure is not equivalent to the target"
                    ),
                )
            )

        return verdicts


class FunctionalGroupJudge(Judge[str, ChemistryStep, ChemistryLineVerdict]):
    """Checks whether each submitted molecule contains a target group.

    The problem is a group name from FUNCTIONAL_GROUP_SMARTS rather than a
    target SMILES, so this asks "did the student draw something with an
    ester in it" instead of "did the student draw this exact molecule".
    Like ChemistryJudge, each line is an independent candidate.
    """

    def check(
        self,
        target_group: str,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        pattern = _FUNCTIONAL_GROUP_PATTERNS.get(target_group)
        if pattern is None:
            supported = ", ".join(sorted(FUNCTIONAL_GROUP_SMARTS))
            raise ValueError(
                f"unknown functional group {target_group!r}; supported groups "
                f"are: {supported}"
            )

        verdicts: list[ChemistryLineVerdict] = []
        for step in steps:
            try:
                submitted = _parse_smiles(step.smiles)
                support_reason = _support_reason(submitted)
                if support_reason:
                    raise UnsupportedChemistryError(support_reason)
                contains_group = submitted.HasSubstructMatch(pattern)
            except UnsupportedChemistryError as exc:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail=str(exc),
                    )
                )
                continue
            except ChemistryParseError as exc:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=str(exc),
                    )
                )
                continue
            except Exception:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail="Submitted structure could not be checked safely",
                    )
                )
                continue

            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=contains_group,
                    error_type=None if contains_group else "wrong_functional_group",
                    detail=(
                        None
                        if contains_group
                        else "Submitted structure does not contain the target group"
                    ),
                )
            )

        return verdicts
