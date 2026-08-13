// Kept out of VerdictCard.jsx so that file exports only a component, which
// is what React Fast Refresh needs to hot-reload it cleanly.
//
// Labels describe the deterministic category without exposing raw enum names.

const CATEGORY_LABELS = {
  // Chemistry
  structure_mismatch: "different structure",
  wrong_functional_group: "different functional group",
  unbalanced_atoms: "atoms don't balance",
  unbalanced_charge: "charge doesn't balance",
  wrong_value: "different value",
  wrong_unit: "different unit",
  wrong_formula: "different formula",
  wrong_species: "different species",
  wrong_oxidation_state: "different oxidation state",
  wrong_name: "different name",
  wrong_direction: "different direction",
  wrong_coefficients: "different coefficients",
  not_net_ionic: "spectator ions still present",

    // Pre-algebra
  order_of_operations: "order of operations error",
  fraction: "fraction error",
  exponent: "exponent error",

  // Algebra
  sign: "sign error",
  arithmetic: "arithmetic error",
  division: "division error",
  distribution: "distribution error",
  algebraic: "algebraic error",

  // Trigonometry
  trig_sign: "trigonometric sign error",
  trig_value: "trigonometric value error",
  trig_reciprocal: "reciprocal identity error",
  trig_quotient: "quotient identity error",
  trig_identity: "trigonometric identity error",
  trig_algebraic: "trigonometric algebra error",

  // Calculus
  derivative_power_rule: "power rule error",
  derivative_product_rule: "product rule error",
  derivative_chain_rule: "chain rule error",
  derivative_sum_rule: "sum rule error",
  derivative_trig_rule: "trigonometric derivative error",
  derivative_rule: "derivative rule error",
  integral_rule: "integration error",
  limit_evaluation: "limit evaluation error",
  calculus_algebraic: "calculus algebra error",
};

const WARNING_LABELS = {
  missing_constant_of_integration:
    "Your antiderivative is correct, but an indefinite integral should include an arbitrary constant such as + C.",
};

export function categoryLabel(errorType) {
  if (!errorType) return null;

  return CATEGORY_LABELS[errorType] ?? errorType.replaceAll("_", " ");
}

export function warningLabel(warningType) {
  if (!warningType) return null;

  return WARNING_LABELS[warningType] ?? warningType.replaceAll("_", " ");
}

export default CATEGORY_LABELS;