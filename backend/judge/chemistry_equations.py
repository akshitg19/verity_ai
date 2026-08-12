"""Equation balancing and redox charge accounting.

Deliberately RDKit-free: balancing is formula parsing plus arithmetic, so
this module has no dependency on the structure judge and no molecular
interpretation of a formula. "H2O" here is a bag of atoms and a charge,
nothing more.
"""

import re
from fractions import Fraction
from math import gcd

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
# The dot in a hydrate, however the keyboard produced it.
_HYDRATE_SPLIT_RE = re.compile(r"[·⋅•∙.*]")
MAX_HYDRATE_PARTS = 6

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
    """Split a trailing charge such as "^3+" or "2-" off a formula.

    With a caret there is nothing to decide: "Cr2O7^2-" says which digits
    are the charge. Without one the digits are shared between the last
    subscript and the charge, and reading all of them as the charge is
    wrong in the common case. "MnO4-" was parsed as MnO with a charge of
    minus four, which made the oxidation state of Mn come out at -2 instead
    of +7, silently, with no error. Every ion a student writes the ordinary
    way was affected: SO42- gave -40 for sulfur and NH4+ gave +3 for
    nitrogen.

    Two rules resolve it, and between them they cover how ions are actually
    written:

    * A body that is one element symbol takes the whole run as its charge.
      Fe3+ is iron three plus, not three irons carrying one charge.
    * Otherwise the last digit is the charge and the rest is the subscript
      it was written next to. SO42- is sulfate, MnO4- is permanganate.

    Neither rule fires when a caret is present, so nothing that was already
    unambiguous changes.
    """
    match = CHARGE_SUFFIX_RE.search(text)
    if not match:
        return text, 0

    digits, sign = match.groups()
    body = text[: match.start()]

    if digits and "^" not in text and not _is_single_element(body):
        if len(digits) == 1:
            # One digit after a multi-element body is that element's
            # subscript, and the charge is a single unit: MnO4-, NO3-, NH4+.
            body, digits = body + digits, ""
        else:
            # Two or more: the last is the charge, the rest is the
            # subscript it was written next to. SO42-, Cr2O72-, PO43-.
            body, digits = body + digits[:-1], digits[-1]

    magnitude = int(digits) if digits else 1
    if magnitude > MAX_SUBSCRIPT:
        raise EquationParseError(f"charge is too large in {text!r}")
    charge = magnitude if sign == "+" else -magnitude
    return body, charge


def _is_single_element(body: str) -> bool:
    """Whether the body is one element symbol and nothing else."""
    return body in ELEMENT_SYMBOLS


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

    return _parse_hydrate(body), charge


def _parse_hydrate(body: str) -> dict[str, int]:
    """Expand a hydrate, where a dot means "and this many of these too".

    CuSO4.5H2O is copper sulfate pentahydrate and is one of the standard
    molar mass questions on any sheet. It was a parse error, which meant a
    student could not ask it and a worked example could not use it, and the
    demo script carried "no hydrates" as a thing to avoid on stage.

    The separator is written as a middle dot, a bullet, or a full stop
    depending on the keyboard, and the part after it usually carries a
    multiplier: 5H2O is five waters.
    """
    parts = [part for part in _HYDRATE_SPLIT_RE.split(body) if part]
    if len(parts) == 1:
        return _parse_atoms(body)
    if len(parts) > MAX_HYDRATE_PARTS:
        raise EquationParseError(f"formula {body!r} has too many parts")

    total: dict[str, int] = {}
    for part in parts:
        digits, remainder = COEFFICIENT_RE.match(part).groups()
        multiplier = int(digits) if digits else 1
        if multiplier > MAX_SUBSCRIPT:
            raise EquationParseError(f"subscript is too large in {body!r}")
        if not remainder:
            raise EquationParseError(f"could not read {body!r} as a formula")
        for symbol, count in _parse_atoms(remainder).items():
            total[symbol] = total.get(symbol, 0) + count * multiplier
    return total


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


# ---------------------------------------------------------------------------
# Solving for the coefficients.
#
# Checking a line balances is arithmetic. Producing the balanced coefficients
# is linear algebra: one equation per element (plus one for charge), one
# unknown per species, solved exactly over the rationals. It is what the
# answer vault needs, what a generated worked example is verified against,
# and what tells the hint layer how many steps are left before the answer.
#
# Done with Fractions rather than SymPy on purpose: this module stays free of
# both RDKit and SymPy, so a balancing bug can never be a symbolic-algebra
# bug in disguise.
# ---------------------------------------------------------------------------


class EquationUnbalanceableError(ValueError):
    """No positive integer coefficients balance this equation."""


def _rref(matrix: list[list[Fraction]]) -> tuple[list[list[Fraction]], list[int]]:
    """Reduced row echelon form, exact. Returns the matrix and pivot columns."""
    rows = [row[:] for row in matrix]
    pivots: list[int] = []
    pivot_row = 0
    width = len(rows[0]) if rows else 0

    for column in range(width):
        candidate = next(
            (r for r in range(pivot_row, len(rows)) if rows[r][column] != 0),
            None,
        )
        if candidate is None:
            continue
        rows[pivot_row], rows[candidate] = rows[candidate], rows[pivot_row]
        scale = rows[pivot_row][column]
        rows[pivot_row] = [value / scale for value in rows[pivot_row]]
        for r in range(len(rows)):
            if r != pivot_row and rows[r][column] != 0:
                factor = rows[r][column]
                rows[r] = [
                    value - factor * pivot_value
                    for value, pivot_value in zip(rows[r], rows[pivot_row])
                ]
        pivots.append(column)
        pivot_row += 1
        if pivot_row == len(rows):
            break

    return rows, pivots


def _nullspace(matrix: list[list[Fraction]], width: int) -> list[list[Fraction]]:
    if not matrix:
        return [
            [Fraction(1) if i == j else Fraction(0) for i in range(width)]
            for j in range(width)
        ]
    rows, pivots = _rref(matrix)
    free_columns = [column for column in range(width) if column not in pivots]

    basis: list[list[Fraction]] = []
    for free in free_columns:
        vector = [Fraction(0)] * width
        vector[free] = Fraction(1)
        for row_index, pivot_column in enumerate(pivots):
            vector[pivot_column] = -rows[row_index][free]
        basis.append(vector)
    return basis


def _species_matrix(
    left: list[tuple[int, str]],
    right: list[tuple[int, str]],
) -> tuple[list[list[Fraction]], int]:
    """One row per element (and one for charge), one column per species."""
    species = [formula for _, formula in left] + [formula for _, formula in right]
    signs = [1] * len(left) + [-1] * len(right)

    parsed = [parse_formula(formula) for formula in species]
    elements = sorted({symbol for atoms, _ in parsed for symbol in atoms})

    matrix: list[list[Fraction]] = []
    for element in elements:
        matrix.append(
            [
                Fraction(atoms.get(element, 0) * sign)
                for (atoms, _), sign in zip(parsed, signs)
            ]
        )
    if any(charge for _, charge in parsed):
        matrix.append(
            [Fraction(charge * sign) for (_, charge), sign in zip(parsed, signs)]
        )
    return matrix, len(species)


def balance_coefficients(equation: str) -> tuple[list[int], list[int]]:
    """Return the smallest positive integer coefficients that balance it.

    >>> balance_coefficients("H2 + O2 -> H2O")
    ([2, 1], [2])

    The coefficients already written on the reference equation are ignored,
    so "2H2 + O2 -> 2H2O" and "H2 + O2 -> H2O" solve identically.
    """
    left, right = parse_equation(equation)
    matrix, width = _species_matrix(left, right)
    basis = _nullspace(matrix, width)

    if not basis:
        raise EquationUnbalanceableError(
            "no combination of coefficients balances this equation"
        )
    if len(basis) > 1:
        # More than one independent solution means the equation as written
        # does not pin down a single answer (typically two unrelated
        # reactions written as one). Guessing one would be a confident
        # wrong answer, which is the failure this product must not have.
        raise EquationUnbalanceableError(
            "this equation has more than one independent set of coefficients"
        )

    vector = basis[0]
    denominators = [value.denominator for value in vector]
    multiplier = 1
    for denominator in denominators:
        multiplier = multiplier * denominator // gcd(multiplier, denominator)
    integers = [int(value * multiplier) for value in vector]

    if all(value < 0 for value in integers):
        integers = [-value for value in integers]
    if any(value <= 0 for value in integers):
        raise EquationUnbalanceableError(
            "balancing this equation would need a zero or negative coefficient"
        )

    divisor = 0
    for value in integers:
        divisor = gcd(divisor, value)
    if divisor > 1:
        integers = [value // divisor for value in integers]
    if any(value > MAX_COEFFICIENT for value in integers):
        raise EquationUnbalanceableError("balanced coefficients are implausibly large")

    return integers[: len(left)], integers[len(left):]


def _format_side(side: list[tuple[int, str]], coefficients: list[int]) -> str:
    return " + ".join(
        (formula if coefficient == 1 else f"{coefficient}{formula}")
        for coefficient, (_, formula) in zip(coefficients, side)
    )


def balanced_equation(equation: str) -> str:
    """The fully balanced form of an equation, as a string.

    >>> balanced_equation("H2 + O2 -> H2O")
    '2H2 + O2 -> 2H2O'
    """
    left, right = parse_equation(equation)
    left_coefficients, right_coefficients = balance_coefficients(equation)
    return (
        f"{_format_side(left, left_coefficients)} -> "
        f"{_format_side(right, right_coefficients)}"
    )


def is_balanced(equation: str) -> bool:
    """True when both atoms and charge already balance as written."""
    left, right = parse_equation(equation)
    left_atoms, left_charge = _tally(left)
    right_atoms, right_charge = _tally(right)
    return left_atoms == right_atoms and left_charge == right_charge


def coefficient_distance(equation: str) -> int | None:
    """How many coefficients differ from the balanced answer, or None.

    This is what makes terminal-step detection possible for balancing: a
    line one coefficient away from balanced is the last step, and level 3
    must decline on it.
    """
    left, right = parse_equation(equation)
    try:
        left_correct, right_correct = balance_coefficients(equation)
    except (EquationUnbalanceableError, EquationParseError):
        return None
    written = [coefficient for coefficient, _ in left + right]
    correct = left_correct + right_correct
    # A student who writes 4H2 + 2O2 -> 4H2O is balanced, just not reduced,
    # so compare the reduced forms rather than counting that as four errors.
    divisor = 0
    for value in written:
        divisor = gcd(divisor, value)
    if divisor > 1:
        written = [value // divisor for value in written]
    return sum(1 for a, b in zip(written, correct) if a != b)


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
