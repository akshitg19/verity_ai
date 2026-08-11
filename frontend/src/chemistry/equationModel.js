// Enough equation parsing to *show* a student what is happening.
//
// The backend already judges balancing exactly, and nothing here is ever used
// to decide whether a step is right. This exists so a worked example can put
// an atom tally next to the equation and let the counts move as coefficients
// appear, which is the part that actually explains balancing.

const ARROWS = ["->", "→", "⟶", "=>", "⇒", "-->"];

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

export function parseSide(side) {
  return side
    .split("+")
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
  // Trim the prose a model writes around the equation: keep only the trailing
  // run of terms on the left that look like formulas, and the leading run on
  // the right.
  const left = parseSide(rawLeft).filter((term) => /^[A-Z]/.test(term.formula));
  const right = parseSide(rawRight)
    .map((term) => ({ ...term, formula: term.formula.replace(/[.,;:!?]+$/, "") }))
    .filter((term) => /^[A-Z]/.test(term.formula));

  if (!left.length || !right.length) return null;
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
