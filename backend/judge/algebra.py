import re

from sympy import (
    Add,
    Eq,
    Float,
    Function,
    Integer,
    Mul,
    Pow,
    Rational,
    Symbol,
    simplify,
)
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    rationalize,
    standard_transformations,
)

from schemas import LineVerdict, Step
from .base import Judge

TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
    rationalize,
)
MAX_MATH_LENGTH = 256
MAX_PAREN_DEPTH = 16
MAX_NUMBER_DIGITS = 12
ALLOWED_MATH_RE = re.compile(r"^[0-9a-z+\-*/^=().\s]+$")
IDENTIFIER_RE = re.compile(r"[a-z]+")
NUMBER_RE = re.compile(r"\d+")
TOKEN_RE = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+|[a-z]|[+\-*/=()])")
SCIENTIFIC_NOTATION_RE = re.compile(
    r"(?:\d+(?:\.\d*)?|\.\d+)e[+\-]?\d+"
)
SAFE_GLOBALS = {
    "__builtins__": {},
    "Symbol": Symbol,
    "Integer": Integer,
    "Float": Float,
    "Rational": Rational,
    "Add": Add,
    "Mul": Mul,
    "Pow": Pow,
}


class UnsupportedMathError(ValueError):
    """The input is valid-looking math but outside the linear MVP grammar."""


def _validate_tokens(text: str) -> None:
    """Reject syntax that SymPy's implicit multiplication would silently fix."""
    tokens: list[tuple[str, str]] = []
    position = 0
    for match in TOKEN_RE.finditer(text):
        if text[position:match.start()].strip():
            raise ValueError("math input contains a malformed token")
        token = match.group(0)
        token_type = (
            "number"
            if token[0].isdigit() or token.startswith(".")
            else "variable"
            if token.isalpha()
            else token
        )
        tokens.append((token_type, token))
        position = match.end()
    if text[position:].strip():
        raise ValueError("math input contains a malformed token")

    for (previous_type, _), (current_type, _) in zip(tokens, tokens[1:]):
        if previous_type == "number" and current_type == "number":
            raise ValueError("numbers must be separated by a math operator")
        if previous_type == "variable" and current_type == "number":
            raise ValueError("a coefficient must be written before its variable")
        if previous_type == "variable" and current_type == "(":
            raise UnsupportedMathError("function-style notation is not supported")
        if previous_type == "/" and current_type == "/":
            raise ValueError("floor division is not supported")


def _validated_local_dict(text: str) -> dict[str, Symbol]:
    if not text or len(text) > MAX_MATH_LENGTH:
        raise ValueError(f"math input must be 1-{MAX_MATH_LENGTH} characters")
    if not ALLOWED_MATH_RE.fullmatch(text):
        raise ValueError("math input contains unsupported characters")
    if text.count("=") > 1:
        raise ValueError("math input must contain at most one equals sign")
    if "^" in text or "**" in text:
        raise UnsupportedMathError("exponents are not supported")
    if SCIENTIFIC_NOTATION_RE.search(text):
        raise UnsupportedMathError("scientific notation is not supported")
    _validate_tokens(text)

    depth = 0
    for char in text:
        if char == "(":
            depth += 1
            if depth > MAX_PAREN_DEPTH:
                raise ValueError("math input is nested too deeply")
        elif char == ")":
            depth -= 1
            if depth < 0:
                raise ValueError("math input has unbalanced parentheses")
    if depth:
        raise ValueError("math input has unbalanced parentheses")

    identifiers = IDENTIFIER_RE.findall(text)
    if any(len(name) != 1 for name in identifiers):
        raise UnsupportedMathError("only single-letter variables are supported")
    if any(len(number) > MAX_NUMBER_DIGITS for number in NUMBER_RE.findall(text)):
        raise ValueError("numeric literal is too large")

    return {name: Symbol(name) for name in set(identifiers)}


def _parse_expression(text: str, *, evaluate: bool = True):
    local_dict = _validated_local_dict(text)
    return parse_expr(
        text,
        local_dict=local_dict,
        global_dict=SAFE_GLOBALS.copy(),
        transformations=TRANSFORMS,
        evaluate=evaluate,
    )


def _parse_equation(text: str):
    """Parse 'lhs = rhs' into a SymPy Eq. Raises on failure."""
    if "=" not in text:
        # bare expression (arithmetic like "7 + 5" or a final value "12")
        return _parse_expression(text)
    lhs, rhs = text.split("=", 1)
    return Eq(
        _parse_expression(lhs.strip()),
        _parse_expression(rhs.strip()),
        evaluate=False,
    )


def _parse_structural(text: str):
    """Like _parse_equation but with evaluate=False, preserving written
    structure. SymPy auto-distributes numeric coefficients on normal parse
    (3(x-4) becomes 3x-12 immediately), which erases exactly the
    parenthesized shape the distribution-error check needs to see.
    Returns None if the text can't be parsed this way."""
    try:
        if "=" not in text:
            return _parse_expression(text, evaluate=False)
        lhs, rhs = text.split("=", 1)
        return Eq(
            _parse_expression(lhs.strip(), evaluate=False),
            _parse_expression(rhs.strip(), evaluate=False),
            evaluate=False,
        )
    except Exception:
        return None


def _written_symbols(structural) -> set[Symbol]:
    if isinstance(structural, Eq):
        return structural.lhs.free_symbols | structural.rhs.free_symbols
    if structural is not None and hasattr(structural, "free_symbols"):
        return structural.free_symbols
    return set()


def _support_reason(parsed, structural, allowed_symbols=None) -> str | None:
    """Return why an expression is outside the one-variable linear MVP."""
    symbols = _written_symbols(structural)
    if len(symbols) > 1:
        return "only one-variable math is supported"
    if allowed_symbols is not None and not symbols.issubset(allowed_symbols):
        extra = ", ".join(sorted(str(s) for s in symbols - allowed_symbols))
        return f"uses variable(s) not in the problem: {extra}"

    structural_parts = (
        (structural.lhs, structural.rhs)
        if isinstance(structural, Eq)
        else (structural,)
    )
    for expression in structural_parts:
        if expression is None:
            return "could not preserve the written structure"
        if expression.atoms(Function):
            return "functions are not supported"
        # Inspect the written tree before SymPy can cancel nonlinear terms.
        # For example, x(x-x)+x simplifies to x, but it is still outside the
        # one-variable linear grammar promised by this MVP.
        for product in expression.atoms(Mul):
            symbol_factors = sum(
                bool(factor.free_symbols) for factor in product.args
            )
            if symbol_factors > 1:
                return "products of variable expressions are not supported"
        for power in expression.atoms(Pow):
            if power.base.free_symbols and power.exp != 1:
                return "variable powers and variable denominators are not supported"

    parts = (parsed.lhs, parsed.rhs) if isinstance(parsed, Eq) else (parsed,)
    if not isinstance(parsed, Eq) and symbols:
        return "symbolic bare expressions are not supported"

    symbol = next(iter(symbols), None)
    for expression in parts:
        if symbol is None:
            if expression.free_symbols or expression.is_rational is not True:
                return "only rational arithmetic is supported"
            continue
        polynomial = expression.as_poly(symbol)
        if polynomial is None or polynomial.degree() > 1:
            return "only linear polynomial equations are supported"
        if any(
            coefficient.is_rational is not True
            for coefficient in polynomial.all_coeffs()
        ):
            return "only rational coefficients are supported"
    return None


def _equations_equivalent(eq1, eq2) -> bool:
    """Two equations are equivalent if they have the same solution set.

    Check: (lhs1 - rhs1) and (lhs2 - rhs2) are scalar multiples of each other.
    """
    diff1 = simplify(eq1.lhs - eq1.rhs)
    diff2 = simplify(eq2.lhs - eq2.rhs)

    if diff1 == 0 and diff2 == 0:
        return True
    if diff1 == 0 or diff2 == 0:
        return False

    ratio = simplify(diff1 / diff2)
    return ratio.is_constant() and ratio != 0


# ---------------------------------------------------------------------------
# Error classification.
#
# When a step is NOT equivalent to the reference line, we try to name the
# kind of mistake by testing small deterministic "repairs" against the
# reference. If flipping one term's sign makes the step valid, it was a
# sign error; if the step matches a partially-distributed version of the
# reference, it was a distribution error; and so on. Every test is exact
# SymPy computation -- no guessing. If nothing matches, we fall back to
# the generic "algebraic" category rather than inventing a cause.
# ---------------------------------------------------------------------------


def _is_sign_error(ref: Eq, cur: Eq) -> bool:
    """Would flipping the sign of exactly one term in `cur` make it valid?"""
    for side_name in ("lhs", "rhs"):
        side = getattr(cur, side_name)
        other = cur.rhs if side_name == "lhs" else cur.lhs
        for term in Add.make_args(side):
            flipped = side - 2 * term
            candidate = (
                Eq(flipped, other) if side_name == "lhs" else Eq(other, flipped)
            )
            try:
                if _equations_equivalent(ref, candidate):
                    return True
            except Exception:
                continue
    return False


def _is_distribution_error(ref_structural, cur: Eq) -> bool:
    """Does `cur` match the reference with one product distributed into only
    some terms of a parenthesized sum -- e.g. 3(x - 4) copied down as 3x - 4?
    `ref_structural` must be the evaluate=False parse, because normal parsing
    auto-distributes numeric coefficients and destroys the pattern."""
    if ref_structural is None or not isinstance(ref_structural, Eq):
        return False
    ref = ref_structural
    for side_name in ("lhs", "rhs"):
        side = getattr(ref, side_name)
        other = ref.rhs if side_name == "lhs" else ref.lhs
        for node in side.atoms(Mul):
            add_factors = [a for a in node.args if isinstance(a, Add)]
            if len(add_factors) != 1:
                continue
            inner = add_factors[0]
            # Build the coefficient from the remaining factors rather than
            # dividing -- division on evaluate=False trees can misbehave.
            other_factors = [a for a in node.args if a is not inner]
            coeff = Mul(*other_factors) if other_factors else 1
            terms = Add.make_args(inner)
            if len(terms) < 2:
                continue
            # Partial expansions: coeff multiplied into exactly one term,
            # the remaining terms copied down unmultiplied.
            for i in range(len(terms)):
                partial = coeff * terms[i] + Add(
                    *[t for j, t in enumerate(terms) if j != i]
                )
                broken_side = side.xreplace({node: partial})
                candidate = (
                    Eq(broken_side, other)
                    if side_name == "lhs"
                    else Eq(other, broken_side)
                )
                same_orientation = (
                    simplify(candidate.lhs - cur.lhs) == 0
                    and simplify(candidate.rhs - cur.rhs) == 0
                )
                swapped_orientation = (
                    simplify(candidate.lhs - cur.rhs) == 0
                    and simplify(candidate.rhs - cur.lhs) == 0
                )
                if same_orientation or swapped_orientation:
                    return True
    return False


def _is_one_side_scaling_error(ref: Eq, cur: Eq) -> bool:
    """Detect an exact scale applied to one side while the other is unchanged."""
    for ref_scaled, cur_scaled, ref_unchanged, cur_unchanged in (
        (ref.lhs, cur.lhs, ref.rhs, cur.rhs),
        (ref.rhs, cur.rhs, ref.lhs, cur.lhs),
    ):
        if (
            not ref_scaled.free_symbols
            or simplify(ref_unchanged - cur_unchanged) != 0
            or ref_scaled == 0
        ):
            continue
        ratio = simplify(cur_scaled / ref_scaled)
        if ratio.is_constant() and ratio not in (0, 1):
            return True
    return False


def _is_constant_arithmetic_error(ref: Eq, cur: Eq) -> bool:
    """Detect a conservative two-sided constant-calculation slip.

    Requiring both written sides to retain their variable coefficients and
    change their constants avoids inventing an arithmetic cause for an
    unrelated line such as ``x = 2`` -> ``x = 999``.
    """
    symbols = ref.free_symbols | cur.free_symbols
    if len(symbols) != 1:
        return False
    variable = next(iter(symbols))
    changed_sides = 0
    for ref_side, cur_side in ((ref.lhs, cur.lhs), (ref.rhs, cur.rhs)):
        ref_poly = ref_side.as_poly(variable)
        cur_poly = cur_side.as_poly(variable)
        if ref_poly is None or cur_poly is None:
            return False
        if ref_poly.nth(1) != cur_poly.nth(1):
            return False
        if ref_poly.nth(0) != cur_poly.nth(0):
            changed_sides += 1
    return changed_sides == 2


def _classify(ref: Eq, cur: Eq, ref_structural) -> tuple[str, str]:
    """Name the error in `cur` relative to `ref`. Both must be Eq.
    `ref_structural` is the evaluate=False parse of the reference text
    (may be None), used only for the distribution check."""
    if _is_sign_error(ref, cur):
        return (
            "sign",
            "Flipping the sign of one term makes this step equivalent",
        )
    if _is_distribution_error(ref_structural, cur):
        return (
            "distribution",
            "Step matches a partially-distributed version of the reference",
        )
    if _is_constant_arithmetic_error(ref, cur):
        return (
            "arithmetic",
            "Variable terms match on each side, but both constants changed",
        )
    if _is_one_side_scaling_error(ref, cur):
        return (
            "division",
            "Only one side was multiplied or divided by a constant",
        )
    return ("algebraic", "Step is not equivalent to previous line")


class AlgebraJudge(Judge[str, Step, LineVerdict]):
    def check(self, problem: str, steps: list[Step]) -> list[LineVerdict]:
        verdicts: list[LineVerdict] = []

        try:
            reference = _parse_equation(problem)
            reference_structural = _parse_structural(problem)
            support_reason = _support_reason(reference, reference_structural)
        except UnsupportedMathError as exc:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported problem: {exc}",
                )
            ]
        except Exception as e:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="parse_error",
                    detail=f"Could not parse problem: {e}",
                )
            ]

        if support_reason:
            return [
                LineVerdict(
                    line_number=0,
                    valid=False,
                    error_type="unsupported",
                    detail=f"Unsupported problem: {support_reason}",
                )
            ]

        problem_symbols = _written_symbols(reference_structural)

        # Each valid step becomes the new reference; invalid steps don't,
        # so one mistake doesn't cascade false errors down every later line.
        for step in steps:
            try:
                current = _parse_equation(step.latex)
                current_structural = _parse_structural(step.latex)
                support_reason = _support_reason(
                    current,
                    current_structural,
                    allowed_symbols=problem_symbols,
                )
            except UnsupportedMathError as exc:
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail=str(exc),
                    )
                )
                continue
            except Exception as e:
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="parse_error",
                        detail=str(e),
                    )
                )
                continue

            if support_reason:
                verdicts.append(
                    LineVerdict(
                        line_number=step.line_number,
                        valid=False,
                        error_type="unsupported",
                        detail=support_reason,
                    )
                )
                continue

            try:
                # Case 1: both are equations -> check equivalence
                if isinstance(reference, Eq) and isinstance(current, Eq):
                    ok = _equations_equivalent(reference, current)
                    error_type, detail = (
                        (None, None)
                        if ok
                        else _classify(reference, current, reference_structural)
                    )
                # Case 2: both bare expressions (pure arithmetic) -> compare values
                elif not isinstance(reference, Eq) and not isinstance(current, Eq):
                    ok = simplify(reference - current) == 0
                    error_type, detail = (
                        (None, None)
                        if ok
                        else ("arithmetic", "Value differs from previous line")
                    )
                else:
                    ok = False
                    error_type, detail = (
                        "unsupported",
                        "Equation and bare expression cannot be compared",
                    )
            except Exception:
                ok = False
                error_type, detail = (
                    "unsupported",
                    "This transformation is outside the supported linear checks",
                )

            verdicts.append(
                LineVerdict(
                    line_number=step.line_number,
                    valid=ok,
                    error_type=error_type,
                    detail=detail,
                )
            )
            if ok:
                reference = current
                reference_structural = current_structural

        return verdicts
