"""IUPAC naming: the half of chemistry subject 6 that is a name, not a graph.

OPSIN turns a chemical name into a structure, and once it has, the question
"did the student name this correctly" collapses into the canonical-SMILES
comparison `ChemistryJudge` already does exactly.

Gated on availability, deliberately. `py2opsin` wraps a Java program, and
`final_tasks.md` is explicit that a Java runtime must not become a hard
requirement for everyone working on the repo. So the import is optional and
its absence produces `unsupported` -- our limitation, stated plainly -- and
never a claim that the student's name was wrong.

The same distinction applies one level down: a name OPSIN cannot parse is a
`parse_error`, because OPSIN failing to read a name is not proof that the
name is wrong.
"""

from __future__ import annotations

import functools
import re

from schemas import ChemistryLineVerdict, ChemistryStep
from .base import Judge
from .chemistry import (
    ChemistryParseError,
    UnsupportedChemistryError,
    _canonical_smiles,
    _parse_smiles,
    _support_reason,
)


MAX_NAME_LENGTH = 256
# A name, not a SMILES: letters, digits, and the punctuation IUPAC uses.
NAME_RE = re.compile(r"^[A-Za-z0-9\s\-,\[\]\(\)'’\.]+$")


class OpsinUnavailableError(RuntimeError):
    """OPSIN or its Java runtime is not installed on this machine."""


class NameParseError(ValueError):
    """OPSIN could not read this text as a chemical name."""


@functools.lru_cache(maxsize=1)
def _opsin():
    try:
        from py2opsin import py2opsin as convert
    except ImportError as exc:  # package not installed
        raise OpsinUnavailableError(
            "py2opsin is not installed, so IUPAC naming is unavailable"
        ) from exc

    try:
        probe = convert("methane")
    except Exception as exc:  # no Java runtime, or OPSIN failed to start
        raise OpsinUnavailableError(
            "OPSIN could not start; a Java runtime is required for naming"
        ) from exc
    if not probe:
        raise OpsinUnavailableError("OPSIN is installed but returned nothing")
    return convert


def opsin_available() -> bool:
    """Whether the naming feature can run at all on this machine."""
    try:
        _opsin()
    except OpsinUnavailableError:
        return False
    return True


def name_to_smiles(name: str) -> str:
    """Resolve one IUPAC name to a SMILES string.

    >>> name_to_smiles("ethanol")  # doctest: +SKIP
    'CCO'
    """
    if not isinstance(name, str) or not name.strip():
        raise NameParseError("a chemical name must be a non-empty string")
    text = name.strip()
    if len(text) > MAX_NAME_LENGTH:
        raise NameParseError("chemical name is too long")
    if not NAME_RE.match(text):
        raise NameParseError("this does not look like a chemical name")

    convert = _opsin()
    try:
        smiles = convert(text)
    except Exception as exc:
        raise NameParseError(f"OPSIN could not read {text!r}") from exc
    if not smiles:
        raise NameParseError(f"OPSIN could not read {text!r} as a chemical name")
    return smiles.strip() if isinstance(smiles, str) else str(smiles).strip()


def looks_like_a_name(text: str) -> bool:
    """A cheap discriminator between a written name and a written SMILES."""
    if not text or not NAME_RE.match(text.strip()):
        return False
    if re.search(r"[=#@\\/\[\]]", text):
        return False
    # The test is a *lowercase* vowel in the original casing, not a vowel in
    # the lowercased string. SMILES element symbols are uppercase, so "CCO"
    # lowercases into something that looks vowel-rich and is not a name,
    # while "ethanol" has real lowercase vowels and "c1ccccc1" has none.
    return bool(re.search(r"[aeiou]", text))


class NamingJudge(Judge[str, ChemistryStep, ChemistryLineVerdict]):
    """Checks a written name against a target structure.

    The problem may be given either as a target SMILES ("name this
    structure") or as a target name ("draw this compound"); both reduce to
    comparing two canonical SMILES once OPSIN has resolved the name.
    """

    def __init__(self, target_name: str | None = None):
        self.target_name = target_name

    def check(
        self,
        target_smiles: str | None,
        steps: list[ChemistryStep],
    ) -> list[ChemistryLineVerdict]:
        try:
            if target_smiles:
                target = _canonical_smiles(_parse_smiles(target_smiles))
            elif self.target_name:
                target = _canonical_smiles(
                    _parse_smiles(name_to_smiles(self.target_name))
                )
            else:
                raise UnsupportedChemistryError(
                    "a naming problem needs a target structure or a target name"
                )
        except OpsinUnavailableError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=str(exc),
                    judged_by="deterministic",
                )
            ]
        except (NameParseError, ChemistryParseError) as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not read the target: {exc}",
                    judged_by="deterministic",
                )
            ]
        except UnsupportedChemistryError as exc:
            return [
                ChemistryLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=str(exc),
                    judged_by="deterministic",
                )
            ]

        verdicts: list[ChemistryLineVerdict] = []
        for step in steps:
            text = step.smiles.strip()
            try:
                if looks_like_a_name(text):
                    written = _parse_smiles(name_to_smiles(text))
                else:
                    written = _parse_smiles(text)
                reason = _support_reason(written)
                if reason:
                    raise UnsupportedChemistryError(reason)
                candidate = _canonical_smiles(written)
            except OpsinUnavailableError as exc:
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
            except (NameParseError, ChemistryParseError) as exc:
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

            matches = candidate == target
            verdicts.append(
                ChemistryLineVerdict(
                    line_number=step.line_number,
                    valid=matches,
                    error_type=None if matches else "wrong_name",
                    detail=(
                        None
                        if matches
                        else "This name resolves to a different structure"
                    ),
                    judged_by="deterministic",
                )
            )
        return verdicts


__all__ = [
    "NameParseError",
    "NamingJudge",
    "OpsinUnavailableError",
    "looks_like_a_name",
    "name_to_smiles",
    "opsin_available",
]
