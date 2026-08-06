// Kept out of VerdictCard.jsx so that file exports only a component, which
// is what React Fast Refresh needs to hot-reload it cleanly.
//
// Every key here is an `error_type` a chemistry judge can emit. The wording
// describes what is different rather than what the student did wrong: the
// verdict already says it is wrong, and repeating that in the label just
// says it twice.

const CATEGORY_LABELS = {
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
  // Math categories, so a shared card never renders a raw enum value.
  sign: "sign error",
  arithmetic: "arithmetic slip",
  division: "division applied unevenly",
  distribution: "distribution error",
  algebraic: "step doesn't follow",
};

export function categoryLabel(errorType) {
  if (!errorType) return null;
  // An unrecognised category must still render something readable, never a
  // blank and never a raw enum.
  return CATEGORY_LABELS[errorType] ?? errorType.replaceAll("_", " ");
}

export default CATEGORY_LABELS;
