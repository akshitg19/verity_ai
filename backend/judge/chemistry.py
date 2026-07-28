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
