import re

from rdkit import Chem
from rdkit.Chem import rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

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
    # The hydrocarbon families and the rest of a first-year sheet. Missing
    # entirely until the live audit: a level 2 example about an addition
    # reaction says "alkene", we had no pattern for it, verification
    # rejected the example, and the student got the static floor. Three
    # times in one run, on three different questions.
    "alkene": "[CX3]=[CX3]",
    "alkyne": "[CX2]#[CX2]",
    "arene": "c1ccccc1",
    "phenol": "[OX2H][c]",
    "nitrile": "[NX1]#[CX2]",
    "thiol": "[#6][SX2H]",
    "alkyl_halide": "[#6][F,Cl,Br,I]",
    "nitro": "[NX3](=[OX1])[OX1-,OX1]",
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

# Generic-aware variants. A pattern demanding [#6] cannot match a wildcard,
# so a student who draws the general ester would fail the ester test they
# just passed by drawing a specific one. Widening the carbon requirement to
# "carbon or wildcard" fixes that without loosening the concrete case,
# because these variants are used only when the drawing actually contains a
# wildcard. The carbonyl, the oxygen, and the nitrogen stay strict, which is
# what keeps an ether from matching the ester pattern.
_GENERIC_CARBON_SUBSTITUTIONS = (
    ("[#6X4]", "[#6X4,#0]"),
    ("[#6]", "[#6,#0]"),
)


def _generic_variant(smarts: str) -> str:
    for strict, generic in _GENERIC_CARBON_SUBSTITUTIONS:
        smarts = smarts.replace(strict, generic)
    return smarts


GENERIC_FUNCTIONAL_GROUP_SMARTS: dict[str, str] = {
    name: _generic_variant(smarts)
    for name, smarts in FUNCTIONAL_GROUP_SMARTS.items()
}
_GENERIC_PATTERNS: dict[str, Chem.Mol] = {
    name: Chem.MolFromSmarts(smarts)
    for name, smarts in GENERIC_FUNCTIONAL_GROUP_SMARTS.items()
}
_UNCOMPILED_GENERIC = sorted(
    name for name, pattern in _GENERIC_PATTERNS.items() if pattern is None
)
if _UNCOMPILED_GENERIC:
    raise RuntimeError(
        "invalid generic functional group SMARTS: " + ", ".join(_UNCOMPILED_GENERIC)
    )


def canonical_group(name: str) -> str | None:
    """The table's name for a group, however it was written.

    "Alcohol", "carboxylic acid" and "CARBOXYLIC_ACID" all name the same
    group, and a lookup that only accepts one spelling was rejecting a
    worked example for a group we have a pattern for. Returns None when we
    genuinely have no pattern, which is a different thing and should be
    reported as one.
    """
    if not isinstance(name, str):
        return None
    key = name.strip().lower().replace(" ", "_").replace("-", "_")
    return key if key in FUNCTIONAL_GROUP_SMARTS else None


def group_pattern(name: str) -> Chem.Mol | None:
    """The compiled pattern for a group name, however it was written."""
    key = canonical_group(name)
    return _FUNCTIONAL_GROUP_PATTERNS[key] if key else None


class ChemistryParseError(ValueError):
    """The supplied text is not a valid SMILES molecule."""


class UnsupportedChemistryError(ValueError):
    """The SMILES parses but is outside the deliberately narrow MVP scope."""


# ---------------------------------------------------------------------------
# Generic structures.
#
# The Aug 4 failure that motivated the whole architecture revision: a student
# drew the general ester R-C(=O)-O-R', Gemini read it correctly as
# O=C(R)OR, and RDKit returned None because there is no atom called R. The
# fix is to normalise the R-group family onto the SMILES wildcard `*`, which
# RDKit does understand, so O=C(*)O* and *C(=O)O* both canonicalise to
# *OC(*)=O and compare equal.
#
# `Ar` is deliberately read as "aryl" rather than as argon. Argon appears in
# no organic structure a student draws, aryl appears constantly, and the
# element is outside SUPPORTED_ATOMIC_NUMBERS anyway.
# ---------------------------------------------------------------------------
# No element symbol has an uppercase R, A, or X as its *second* letter, so
# the trailing lookahead alone is enough to protect Rb, Ru, Re, Rn, and Xe.
# A preceding-character guard would break the common `OR'` ending, which is
# precisely how a student writes an ester's second R group.
GENERIC_GROUP_RE = re.compile(r"(R[0-9']*|Ar|X)(?![a-z])")


def normalise_generic_smiles(smiles: str) -> tuple[str, bool]:
    """Rewrite R-group placeholders as SMILES wildcards.

    >>> normalise_generic_smiles("O=C(R)OR'")
    ('O=C(*)O*', True)
    >>> normalise_generic_smiles("CCBr")
    ('CCBr', False)
    """
    if not isinstance(smiles, str):
        return smiles, False
    rewritten = GENERIC_GROUP_RE.sub("*", smiles)
    return rewritten, rewritten != smiles


def is_generic(molecule) -> bool:
    """True when the structure contains at least one wildcard atom."""
    return any(atom.GetAtomicNum() == 0 for atom in molecule.GetAtoms())


def _parse_smiles(smiles: str, *, allow_generic: bool = True):
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

    text = smiles
    if allow_generic:
        text, _ = normalise_generic_smiles(smiles)

    try:
        molecule = Chem.MolFromSmiles(text)
    except Exception as exc:
        raise ChemistryParseError("SMILES could not be parsed") from exc
    if molecule is None:
        raise ChemistryParseError("SMILES could not be parsed")
    return molecule


def _support_reason(molecule, *, allow_generic: bool = True) -> str | None:
    if len(Chem.GetMolFrags(molecule)) != 1:
        return "only one connected molecule is supported"

    for atom in molecule.GetAtoms():
        if atom.GetAtomicNum() == 0:
            if allow_generic:
                continue
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
        # However it was written: "Alcohol" and "carboxylic acid" name
        # groups we have patterns for, and rejecting them for their spelling
        # would be measuring typing rather than chemistry.
        key = canonical_group(target_group)
        if key is None:
            supported = ", ".join(sorted(FUNCTIONAL_GROUP_SMARTS))
            raise ValueError(
                f"unknown functional group {target_group!r}; supported groups "
                f"are: {supported}"
            )
        pattern = _FUNCTIONAL_GROUP_PATTERNS[key]
        generic_pattern = _GENERIC_PATTERNS[key]

        verdicts: list[ChemistryLineVerdict] = []
        for step in steps:
            try:
                submitted = _parse_smiles(step.smiles)
                support_reason = _support_reason(submitted)
                if support_reason:
                    raise UnsupportedChemistryError(support_reason)
                contains_group = submitted.HasSubstructMatch(
                    generic_pattern if is_generic(submitted) else pattern
                )
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


# ---------------------------------------------------------------------------
# Rendering, and isomers.
# ---------------------------------------------------------------------------
DEFAULT_DRAWING_SIZE = (320, 240)


def render_svg(smiles: str, size: tuple[int, int] = DEFAULT_DRAWING_SIZE) -> str:
    """Draw a structure as an SVG, using the RDKit already in the stack.

    This exists because a student cannot verify `O=C(*)O*` and can verify a
    picture instantly. It renders *the student's own structure*, read back to
    them; it is never used to draw a target, which would hand over the answer.
    """
    molecule = _parse_smiles(smiles)
    width, height = size
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    options = drawer.drawOptions()
    options.addStereoAnnotation = True
    options.clearBackground = False
    prepared = rdMolDraw2D.PrepareMolForDrawing(molecule, kekulize=True)
    drawer.DrawMolecule(prepared)
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


def molecular_formula(smiles: str) -> str:
    """The Hill-notation formula of a structure, wildcards included."""
    return rdMolDescriptors.CalcMolFormula(_parse_smiles(smiles))


def canonical_smiles(smiles: str) -> str:
    """Public canonicalisation, R groups normalised to wildcards first."""
    return _canonical_smiles(_parse_smiles(smiles))


def _formula_key(molecule) -> str:
    return rdMolDescriptors.CalcMolFormula(molecule)


def _skeleton_smiles(molecule) -> str:
    """Canonical SMILES with stereochemistry discarded.

    Two stereoisomers share a skeleton and differ only in configuration,
    which is exactly the distinction the isomer judge has to make.
    """
    return Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=False)


class IsomerJudge(Judge[str, ChemistryStep, ChemistryLineVerdict]):
    """Checks whether each drawing is an isomer of a reference structure.

    Three distinct wrong answers are told apart, because they are three
    different misunderstandings: a different compound entirely (wrong
    formula), the same compound redrawn (not an isomer at all), and the
    right kind of relationship but the wrong kind of isomerism.
    """

    def __init__(self, isomer_type: str = "constitutional"):
        if isomer_type not in ("constitutional", "stereo", "any"):
            raise ValueError(
                "isomer_type must be 'constitutional', 'stereo', or 'any'"
            )
        self.isomer_type = isomer_type

    def check(
        self,
        reference_smiles: str,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        try:
            reference = _parse_smiles(reference_smiles)
            reason = _support_reason(reference)
            if reason:
                raise UnsupportedChemistryError(reason)
        except UnsupportedChemistryError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported reference structure: {exc}",
                )
            ]
        except ChemistryParseError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse reference structure: {exc}",
                )
            ]

        reference_formula = _formula_key(reference)
        reference_canonical = _canonical_smiles(reference)
        reference_skeleton = _skeleton_smiles(reference)

        verdicts: list[ChemistryLineVerdict] = []
        for step in steps:
            try:
                submitted = _parse_smiles(step.smiles)
                reason = _support_reason(submitted)
                if reason:
                    raise UnsupportedChemistryError(reason)
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

            if _formula_key(submitted) != reference_formula:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="wrong_formula",
                        detail="An isomer must have the same molecular formula",
                    )
                )
                continue

            canonical = _canonical_smiles(submitted)
            if canonical == reference_canonical:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="structure_mismatch",
                        detail="This is the reference structure redrawn, not an isomer",
                    )
                )
                continue

            same_skeleton = _skeleton_smiles(submitted) == reference_skeleton
            if self.isomer_type == "constitutional":
                valid = not same_skeleton
                detail = (
                    None
                    if valid
                    else "Same connectivity: this is a stereoisomer, not a "
                    "constitutional one"
                )
            elif self.isomer_type == "stereo":
                valid = same_skeleton
                detail = (
                    None
                    if valid
                    else "Different connectivity: this is a constitutional isomer, "
                    "not a stereoisomer"
                )
            else:
                valid, detail = True, None

            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=valid,
                    error_type=None if valid else "structure_mismatch",
                    detail=detail,
                )
            )

        return verdicts


def _formula_counts(formula: str) -> dict[str, int]:
    """Element counts from a written formula, so `C2H6O` and `H6C2O` agree.

    Uses the same parser that judges balancing rather than comparing the
    Hill string, because a student writes `CH3CH2OH` as readily as `C2H6O`
    and both are the same question.
    """
    from .chemistry_equations import parse_formula

    atoms, _ = parse_formula(formula)
    return dict(atoms)


class FormulaStructureJudge(Judge[str, ChemistryStep, ChemistryLineVerdict]):
    """Does this drawing have the formula the student was given?

    Deliberately looser than `ChemistryJudge`, and the looseness is the whole
    point. A molecular formula does not determine a structure: `C2H6O` is
    ethanol and it is also dimethyl ether, and a student asked to "draw a
    structure with this formula" is right either way. Demanding one specific
    isomer would mark a correct drawing wrong, which is the failure this
    product cannot ship with.

    So the question it answers is exactly the question asked: are these the
    right atoms, in the right numbers, in something that is a real molecule.
    Which isomer they drew is not asked and is not judged.

    Where a specific structure *is* the question, that is `ChemistryJudge`,
    and where the relationship between two structures is the question, that
    is `IsomerJudge`. Three different questions, three judges, and the error
    is picking the strict one for a question that was never that strict.
    """

    def check(
        self,
        target_formula: str,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        try:
            wanted = _formula_counts(target_formula)
            if not wanted:
                raise ValueError(f"{target_formula!r} contains no atoms")
        except Exception as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not read the formula: {exc}",
                    judged_by="deterministic",
                )
            ]

        verdicts: list[ChemistryLineVerdict] = []
        for step in steps:
            try:
                submitted = _parse_smiles(step.smiles)
                reason = _support_reason(submitted)
                if reason:
                    raise UnsupportedChemistryError(reason)
            except UnsupportedChemistryError as exc:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail=str(exc),
                        judged_by="deterministic",
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
                        judged_by="deterministic",
                    )
                )
                continue

            try:
                drawn = _formula_counts(molecular_formula(step.smiles))
            except Exception as exc:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=f"Could not read that structure's formula: {exc}",
                        judged_by="deterministic",
                    )
                )
                continue

            if drawn == wanted:
                verdicts.append(
                    ChemistryLineVerdict(
                        line_number=step.line_number,
                        valid=True,
                        # Named so a student sees that a different isomer
                        # would also have been accepted, rather than assuming
                        # they found the one right answer.
                        detail="This structure has the right formula",
                        judged_by="deterministic",
                    )
                )
                continue

            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=False,
                    error_type="wrong_formula",
                    detail="This structure does not have the formula you were given",
                    judged_by="deterministic",
                )
            )
        return verdicts
