"""Equation balancing and redox charge accounting.

Deliberately RDKit-free: balancing is formula parsing plus arithmetic, so
this module has no dependency on the structure judge and no molecular
interpretation of a formula. "H2O" here is a bag of atoms and a charge,
nothing more.
"""

import re

from schemas import BalanceLineVerdict, ChemistryEquationStep
from .base import Judge


MAX_EQUATION_LENGTH = 512
MAX_COEFFICIENT = 999
MAX_SUBSCRIPT = 999
MAX_PAREN_DEPTH = 8

# Accepting several separators costs nothing and matches what students
# actually write, whether typed or transcribed from handwriting.
EQUATION_SEPARATORS = ("<=>", "->", "=>", "⟶", "⇌", "→", "=")
STATE_SYMBOL_RE = re.compile(r"\((?:s|l|g|aq)\)", re.IGNORECASE)
CHARGE_SUFFIX_RE = re.compile(r"\^?(\d*)([+-])$")
ELEMENT_RE = re.compile(r"([A-Z][a-z]{0,2})(\d*)")
COEFFICIENT_RE = re.compile(r"^(\d*)(.*)$", re.DOTALL)
# A "+" is a charge sign rather than a term separator exactly when the text
# before it is the caret charge marker, e.g. the first "+" in "Fe^3+ + e-".
CHARGE_SIGN_CONTEXT_RE = re.compile(r"\^\d*$")

ELEMENT_SYMBOLS = frozenset(
    """
    H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co
    Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb
    Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re
    Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es
    Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og
    """.split()
)
# An electron carries charge but contributes no atoms, which is what makes
# a redox half-reaction balance on charge rather than on atoms alone.
ELECTRON_TOKENS = frozenset({"e", "E"})


class EquationParseError(ValueError):
    """The text is not a chemical formula or equation this parser accepts."""


def _strip_state_symbols(text: str) -> str:
    return STATE_SYMBOL_RE.sub("", text)


def _split_charge(text: str) -> tuple[str, int]:
    """Split a trailing charge such as "^3+" or "2-" off a formula."""
    match = CHARGE_SUFFIX_RE.search(text)
    if not match:
        return text, 0

    digits, sign = match.groups()
    magnitude = int(digits) if digits else 1
    if magnitude > MAX_SUBSCRIPT:
        raise EquationParseError(f"charge is too large in {text!r}")
    charge = magnitude if sign == "+" else -magnitude
    return text[: match.start()], charge


def _parse_atoms(text: str) -> dict[str, int]:
    """Expand a formula body, including nested parenthesised groups."""
    stack: list[dict[str, int]] = [{}]
    position = 0

    while position < len(text):
        character = text[position]

        if character == "(":
            if len(stack) > MAX_PAREN_DEPTH:
                raise EquationParseError(f"formula {text!r} is nested too deeply")
            stack.append({})
            position += 1
            continue

        if character == ")":
            if len(stack) == 1:
                raise EquationParseError(f"formula {text!r} has unbalanced parentheses")
            position += 1
            digits_match = re.match(r"\d*", text[position:])
            digits = digits_match.group(0)
            position += len(digits)
            multiplier = int(digits) if digits else 1
            if multiplier > MAX_SUBSCRIPT:
                raise EquationParseError(f"subscript is too large in {text!r}")
            group = stack.pop()
            for symbol, count in group.items():
                stack[-1][symbol] = stack[-1].get(symbol, 0) + count * multiplier
            continue

        match = ELEMENT_RE.match(text, position)
        if not match or match.start() != position or not match.group(1):
            raise EquationParseError(f"could not read {text!r} as a formula")

        symbol, digits = match.groups()
        if symbol not in ELEMENT_SYMBOLS:
            raise EquationParseError(f"unknown element {symbol!r} in {text!r}")
        count = int(digits) if digits else 1
        if count > MAX_SUBSCRIPT:
            raise EquationParseError(f"subscript is too large in {text!r}")
        stack[-1][symbol] = stack[-1].get(symbol, 0) + count
        position = match.end()

    if len(stack) != 1:
        raise EquationParseError(f"formula {text!r} has unbalanced parentheses")
    return stack[0]


def parse_formula(formula: str) -> tuple[dict[str, int], int]:
    """Return the element counts and net charge of one chemical formula.

    >>> parse_formula("H2O")
    ({'H': 2, 'O': 1}, 0)
    >>> parse_formula("(NH4)2SO4")
    ({'N': 2, 'H': 8, 'S': 1, 'O': 4}, 0)
    >>> parse_formula("Fe^3+")
    ({'Fe': 1}, 3)

    An electron, written "e-", is a charge with no atoms.
    """
    if not isinstance(formula, str):
        raise EquationParseError("formula must be a string")

    text = _strip_state_symbols(formula)
    text = "".join(text.split())
    if not text:
        raise EquationParseError("formula is empty")
    if len(text) > MAX_EQUATION_LENGTH:
        raise EquationParseError("formula is too long")

    body, charge = _split_charge(text)
    if not body:
        raise EquationParseError(f"{formula!r} has a charge but no formula")
    if body in ELECTRON_TOKENS:
        return {}, charge

    return _parse_atoms(body), charge


def _split_terms(side: str) -> list[str]:
    """Split one side on "+", leaving charge signs attached to their ion."""
    terms: list[str] = []
    current: list[str] = []
    for character in side:
        if character == "+" and not CHARGE_SIGN_CONTEXT_RE.search("".join(current)):
            terms.append("".join(current))
            current = []
            continue
        current.append(character)
    terms.append("".join(current))

    stripped = [term.strip() for term in terms]
    if any(not term for term in stripped):
        raise EquationParseError(f"{side.strip()!r} has an empty term")
    return stripped


def _split_coefficient(term: str) -> tuple[int, str]:
    digits, formula = COEFFICIENT_RE.match(term).groups()
    coefficient = int(digits) if digits else 1
    if coefficient == 0:
        raise EquationParseError(f"{term!r} has a zero coefficient")
    if coefficient > MAX_COEFFICIENT:
        raise EquationParseError(f"{term!r} has too large a coefficient")
    if not formula.strip():
        raise EquationParseError(f"{term!r} is a coefficient with no formula")
    return coefficient, formula.strip()


def parse_equation(equation: str) -> tuple[list[tuple[int, str]], list[tuple[int, str]]]:
    """Split an equation into (coefficient, formula) pairs for each side.

    >>> parse_equation("2H2 + O2 -> 2H2O")
    ([(2, 'H2'), (1, 'O2')], [(2, 'H2O')])
    """
    if not isinstance(equation, str):
        raise EquationParseError("equation must be a string")
    if len(equation) > MAX_EQUATION_LENGTH:
        raise EquationParseError("equation is too long")

    text = _strip_state_symbols(equation).strip()
    if not text:
        raise EquationParseError("equation is empty")

    separator = next((s for s in EQUATION_SEPARATORS if s in text), None)
    if separator is None:
        raise EquationParseError(
            "equation needs a separator such as '->' between the two sides"
        )

    left_text, _, right_text = text.partition(separator)
    if separator in right_text:
        raise EquationParseError("equation has more than one separator")
    if not left_text.strip() or not right_text.strip():
        raise EquationParseError("equation is missing one of its two sides")

    left = [_split_coefficient(term) for term in _split_terms(left_text)]
    right = [_split_coefficient(term) for term in _split_terms(right_text)]
    return left, right


def _tally(side: list[tuple[int, str]]) -> tuple[dict[str, int], int]:
    """Sum element counts and charge across one side, weighted by coefficient."""
    atoms: dict[str, int] = {}
    charge = 0
    for coefficient, formula in side:
        counts, formula_charge = parse_formula(formula)
        for symbol, count in counts.items():
            atoms[symbol] = atoms.get(symbol, 0) + count * coefficient
        charge += formula_charge * coefficient
    return {symbol: count for symbol, count in atoms.items() if count}, charge


def _balance_verdict(
    line_number: int,
    equation: str,
) -> BalanceLineVerdict:
    left, right = parse_equation(equation)
    left_atoms, left_charge = _tally(left)
    right_atoms, right_charge = _tally(right)

    if left_atoms != right_atoms:
        mismatched = sorted(
            symbol
            for symbol in set(left_atoms) | set(right_atoms)
            if left_atoms.get(symbol, 0) != right_atoms.get(symbol, 0)
        )
        return BalanceLineVerdict(
            line_number=line_number,
            valid=False,
            error_type="unbalanced_atoms",
            detail=f"Atom counts differ for: {', '.join(mismatched)}",
        )

    # Atoms balance, so any remaining mismatch is charge alone. This is the
    # redox case: a half-reaction with the wrong number of electrons has
    # every atom accounted for and still is not a valid equation.
    if left_charge != right_charge:
        return BalanceLineVerdict(
            line_number=line_number,
            valid=False,
            error_type="unbalanced_charge",
            detail=(
                f"Net charge differs: {left_charge} on the left, "
                f"{right_charge} on the right"
            ),
        )

    return BalanceLineVerdict(line_number=line_number, valid=True)


class BalanceJudge(Judge[str, ChemistryEquationStep, BalanceLineVerdict]):
    """Checks whether each submitted equation balances in atoms and charge.

    A line is judged on its own arithmetic, so an unbalanced attempt does
    not change how any later line is read. The reference equation is parsed
    only to report a malformed problem, matching the other judges' line-0
    convention.
    """

    def check(
        self,
        reference_equation: str,
        steps: list[ChemistryEquationStep],
    ) -> list[BalanceLineVerdict]:
        try:
            parse_equation(reference_equation)
        except EquationParseError as exc:
            return [
                BalanceLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse reference equation: {exc}",
                )
            ]
        except Exception:
            return [
                BalanceLineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail="Reference equation could not be checked safely",
                )
            ]

        verdicts: list[BalanceLineVerdict] = []
        for step in steps:
            try:
                verdicts.append(_balance_verdict(step.line_number, step.equation))
            except EquationParseError as exc:
                verdicts.append(
                    BalanceLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=str(exc),
                    )
                )
            except Exception:
                verdicts.append(
                    BalanceLineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail="Equation could not be checked safely",
                    )
                )

        return verdicts
