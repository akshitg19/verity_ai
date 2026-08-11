// Enough equation parsing to *show* a student what is happening.
//
// The backend already judges balancing exactly, and nothing here is ever used
// to decide whether a step is right. This exists so a worked example can put
// an atom tally next to the equation and let the counts move as coefficients
// appear, which is the part that actually explains balancing.

const ARROWS = ["->", "→", "⟶", "=>", "⇒", "-->"];

// Real symbols, so a word cannot be tallied as an element. Without this,
// "Balance the oxygens: C3H8 + 5O2 -> ..." counted "Balance" as an element
// and put a row for it next to the real ones. Every step the model writes is
// a sentence followed by the chemistry, so prose reaching this parser is the
// normal case and not an edge case.
const ELEMENTS = new Set(
  `H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni
   Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I
   Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt
   Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr
   Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og`.split(/\s+/)
);

// A formula is a run of element symbols, digits and brackets, optionally with
// a charge. Anything with a space, a comma, or a word in it is prose.
const FORMULA_SHAPE = /^[A-Za-z0-9()[\]]+(\^?\d*[+-])?$/;

export function isFormula(text) {
  const body = text.replace(/\^?\d*[+-]$/, "");
  if (!body || !FORMULA_SHAPE.test(text)) return false;
  // An electron is a term in every half-reaction and contributes no atoms.
  if (body === "e" && body !== text) return true;
  const symbols = body.match(/[A-Z][a-z]*/g) ?? [];
  if (!symbols.length) return false;
  return symbols.every((symbol) => ELEMENTS.has(symbol));
}

// "Balance the oxygens: C3H8" -> "C3H8". A step is a sentence and then the
// chemistry, so the formula is the last word of whatever precedes the "+".
function salvageFormula(formula) {
  const candidate = formula
    .split(/\s+/)
    .pop()
    .replace(/^[.,;:!?(]+/, "")
    .replace(/[.,;:!?]+$/, "");
  return isFormula(candidate) ? candidate : null;
}

// "Fe2O3" -> { Fe: 2, O: 3 }, including nested groups like Ca3(PO4)2.
export function countFormula(formula, multiplier = 1) {
  let index = 0;

  const parseGroup = (stopAtParen) => {
    const group = {};
    while (index < formula.length) {
      const character = formula[index];

      if (character === "(" || character === "[") {
        index += 1;
        const inner = parseGroup(true);
        let digits = "";
        while (/\d/.test(formula[index] ?? "")) digits += formula[index++];
        const factor = digits ? Number(digits) : 1;
        for (const [element, count] of Object.entries(inner)) {
          group[element] = (group[element] ?? 0) + count * factor;
        }
        continue;
      }

      if (character === ")" || character === "]") {
        index += 1;
        if (stopAtParen) return group;
        continue;
      }

      if (/[A-Z]/.test(character)) {
        let element = character;
        index += 1;
        while (/[a-z]/.test(formula[index] ?? "")) element += formula[index++];
        let digits = "";
        while (/\d/.test(formula[index] ?? "")) digits += formula[index++];
        group[element] = (group[element] ?? 0) + (digits ? Number(digits) : 1);
        continue;
      }

      index += 1; // charges, dots, anything we do not tally
    }
    return group;
  };

  const parsed = parseGroup(false);
  return Object.fromEntries(
    Object.entries(parsed).map(([element, count]) => [element, count * multiplier])
  );
}

// "4Fe" -> { coefficient: 4, formula: "Fe" }
export function splitTerm(term) {
  const match = term.trim().match(/^(\d+)\s*(.+)$/);
  if (!match) return { coefficient: 1, formula: term.trim() };
  return { coefficient: Number(match[1]), formula: match[2].trim() };
}

// Split on "+", except where the "+" is a charge rather than a separator.
// "MnO4^- + 8H^+ + 5e-" is three terms, and a plain split makes it four, one
// of which is the fragment "8H^". The backend parser draws the same
// distinction the same way: a "+" directly after the caret marker belongs to
// the ion on its left.
const CHARGE_SIGN_CONTEXT = /\^\d*$/;

export function parseSide(side) {
  const terms = [];
  let current = "";
  for (const character of side) {
    if (character === "+" && !CHARGE_SIGN_CONTEXT.test(current)) {
      terms.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  terms.push(current);

  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map(splitTerm);
}

// Returns null when the text does not contain an equation, so a prose-only
// step renders as prose rather than as an empty tally.
export function parseEquation(text) {
  let normalised = text ?? "";
  for (const arrow of ARROWS) normalised = normalised.split(arrow).join("->");
  if (!normalised.includes("->")) return null;

  const [rawLeft, rawRight] = normalised.split("->");

  // Trim the prose a model writes around the equation. This used to keep any
  // term starting with a capital, which let a whole sentence through as a
  // formula. Now every term has to be one, after a chance to salvage the
  // formula from the end of a sentence, and a term that still is not one
  // means this text is prose that happens to contain an arrow.
  //
  // Failing to null rather than tallying what survives is deliberate: a wrong
  // atom count beside a worked example teaches the wrong thing, which is worse
  // than showing the step as plain text.
  const clean = (side) => {
    const terms = [];
    for (const term of parseSide(side)) {
      const formula = isFormula(term.formula)
        ? term.formula
        : salvageFormula(term.formula);
      if (!formula) return null;
      terms.push({ ...term, formula });
    }
    return terms.length ? terms : null;
  };

  const left = clean(rawLeft);
  const right = clean(rawRight);
  if (!left || !right) return null;
  return { left, right };
}

export function tallySide(terms) {
  const totals = {};
  for (const { coefficient, formula } of terms) {
    for (const [element, count] of Object.entries(countFormula(formula, coefficient))) {
      totals[element] = (totals[element] ?? 0) + count;
    }
  }
  return totals;
}

// One row per element: what is on the left, what is on the right, and whether
// they agree yet. This is the thing a teacher writes in the margin.
export function atomTally(text) {
  const equation = parseEquation(text);
  if (!equation) return null;

  const left = tallySide(equation.left);
  const right = tallySide(equation.right);
  const elements = [...new Set([...Object.keys(left), ...Object.keys(right)])];

  return elements.map((element) => ({
    element,
    left: left[element] ?? 0,
    right: right[element] ?? 0,
    balanced: (left[element] ?? 0) === (right[element] ?? 0),
  }));
}
