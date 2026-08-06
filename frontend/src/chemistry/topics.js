// The six chemistry subjects, and the problem types under each.
//
// This file is the answer to the sharpest line in final_tasks.md: two
// finished backend judges shipped and were unreachable, so from a student's
// point of view they did not exist. Every judge the backend mounts appears
// here as a problem type a student can actually pick.
//
// Two levels, never a flat twelve-item dropdown: subject, then topic.

import {
  checkBalance,
  checkCellPotential,
  checkFunctionalGroup,
  checkIsomer,
  checkName,
  checkNetIonic,
  checkOxidationState,
  checkReaction,
  checkSolutions,
  checkStoichiometry,
  checkStructure,
} from "../api";

export const FUNCTIONAL_GROUPS = [
  "ester",
  "ether",
  "alcohol",
  "ketone",
  "aldehyde",
  "carboxylic_acid",
  "amine",
  "amide",
];

export const REACTION_TYPES = [
  "hydration",
  "hydrogenation",
  "hydrohalogenation",
  "oxidation_primary_alcohol",
  "oxidation_secondary_alcohol",
  "oxidation_to_acid",
  "reduction_ketone",
  "reduction_aldehyde",
  "esterification",
  "ester_hydrolysis",
  "amide_formation",
  "saponification",
];

// "C: 40.0, H: 6.7, O: 53.3" -> { C: 40, H: 6.7, O: 53.3 }
export function parsePairs(text) {
  const result = {};
  for (const chunk of (text || "").split(/[,;\n]/)) {
    const match = chunk.trim().match(/^([A-Za-z][A-Za-z0-9()]*)\s*[:=]\s*(-?[\d.]+)$/);
    if (match) result[match[1]] = Number(match[2]);
  }
  return result;
}

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== "" ? parsed : null;
};

const field = (name, label, extra = {}) => ({
  name,
  label,
  type: "text",
  ...extra,
});

// Each problem type declares the fields its judge needs, how to turn those
// fields into a check request, and -- where the backend can solve it -- how
// to open a session so the hint ladder gets an answer vault.
export const TOPICS = [
  {
    id: "stoichiometry",
    label: "Moles & stoichiometry",
    glyph: "⚖",
    blurb: "Formulas, molar mass, mole conversions, limiting reagent, yield.",
    input: "numeric",
    answerPlaceholder: "e.g. n = 2.50 mol",
    types: [
      {
        id: "molar_mass",
        label: "Molar mass",
        fields: [field("formula", "Formula", { placeholder: "H2SO4" })],
      },
      {
        id: "percent_composition",
        label: "Percent composition",
        fields: [
          field("formula", "Formula", { placeholder: "C6H12O6" }),
          field("element", "Element (optional)", { placeholder: "C" }),
        ],
      },
      {
        id: "moles_from_mass",
        label: "Moles from mass",
        fields: [
          field("formula", "Formula", { placeholder: "H2O" }),
          field("mass_g", "Mass (g)", { placeholder: "36.03" }),
        ],
      },
      {
        id: "mass_from_moles",
        label: "Mass from moles",
        fields: [
          field("formula", "Formula", { placeholder: "NaCl" }),
          field("moles", "Moles", { placeholder: "0.25" }),
        ],
      },
      {
        id: "empirical_formula",
        label: "Empirical formula",
        fields: [
          field("composition", "Composition by mass %", {
            placeholder: "C: 40.0, H: 6.7, O: 53.3",
          }),
        ],
      },
      {
        id: "molecular_formula",
        label: "Molecular formula",
        fields: [
          field("composition", "Composition by mass %", {
            placeholder: "C: 40.0, H: 6.7, O: 53.3",
          }),
          field("target_molar_mass", "Molar mass (g/mol)", { placeholder: "180" }),
        ],
      },
      {
        id: "limiting_reagent",
        label: "Limiting reagent",
        fields: [
          field("equation", "Equation", { placeholder: "N2 + H2 -> NH3" }),
          field("amounts", "Amounts (g)", { placeholder: "N2: 28.0, H2: 6.0" }),
        ],
      },
      {
        id: "theoretical_yield",
        label: "Theoretical yield",
        fields: [
          field("equation", "Equation", { placeholder: "N2 + H2 -> NH3" }),
          field("amounts", "Amounts (g)", { placeholder: "N2: 28.0, H2: 6.0" }),
          field("product", "Product", { placeholder: "NH3" }),
        ],
      },
      {
        id: "percent_yield",
        label: "Percent yield",
        fields: [
          field("equation", "Equation", { placeholder: "N2 + H2 -> NH3" }),
          field("amounts", "Amounts (g)", { placeholder: "N2: 28.0, H2: 6.0" }),
          field("product", "Product", { placeholder: "NH3" }),
          field("actual_yield_g", "Actual yield (g)", { placeholder: "25.0" }),
        ],
      },
    ],
    buildPayload(type, values, steps) {
      return {
        task: type.id,
        formula: values.formula || null,
        element: values.element || null,
        mass_g: number(values.mass_g),
        moles: number(values.moles),
        equation: values.equation || null,
        amounts: parsePairs(values.amounts),
        product: values.product || null,
        actual_yield_g: number(values.actual_yield_g),
        composition: parsePairs(values.composition),
        target_molar_mass: number(values.target_molar_mass),
        steps,
      };
    },
    check(type, values, steps) {
      return checkStoichiometry(this.buildPayload(type, values, steps));
    },
    session(type, values, problem) {
      return {
        topic: "stoichiometry",
        problem,
        stoichiometry: this.buildPayload(type, values, [
          { line_number: 1, smiles: "0" },
        ]),
      };
    },
  },

  {
    id: "solutions",
    label: "Solutions, acids & bases",
    glyph: "🧪",
    blurb: "Molarity, dilution, pH, Ka and Kb, buffers, ICE tables, titration.",
    input: "numeric",
    answerPlaceholder: "e.g. pH = 2.88",
    types: [
      {
        id: "molarity",
        label: "Molarity",
        fields: [
          field("formula", "Solute formula", { placeholder: "NaCl" }),
          field("mass_g", "Mass (g)", { placeholder: "5.85" }),
          field("volume_l", "Volume (L)", { placeholder: "1.00" }),
        ],
      },
      {
        id: "dilution",
        label: "Dilution (M1V1 = M2V2)",
        fields: [
          field("initial_concentration_m", "M1", { placeholder: "2.00" }),
          field("initial_volume_l", "V1 (L)", { placeholder: "0.050" }),
          field("final_concentration_m", "M2", { placeholder: "leave blank to solve" }),
          field("final_volume_l", "V2 (L)", { placeholder: "0.500" }),
        ],
      },
      {
        id: "strong_acid_ph",
        label: "pH of a strong acid",
        fields: [
          field("concentration_m", "Concentration (M)", { placeholder: "0.010" }),
          field("protons", "Protons per formula", { placeholder: "1" }),
        ],
      },
      {
        id: "strong_base_ph",
        label: "pH of a strong base",
        fields: [
          field("concentration_m", "Concentration (M)", { placeholder: "0.010" }),
          field("hydroxides", "OH per formula", { placeholder: "1" }),
        ],
      },
      {
        id: "weak_acid_ph",
        label: "pH of a weak acid",
        fields: [
          field("concentration_m", "Concentration (M)", { placeholder: "0.100" }),
          field("ka", "Ka", { placeholder: "1.8e-5" }),
        ],
      },
      {
        id: "weak_base_ph",
        label: "pH of a weak base",
        fields: [
          field("concentration_m", "Concentration (M)", { placeholder: "0.100" }),
          field("kb", "Kb", { placeholder: "1.8e-5" }),
        ],
      },
      {
        id: "buffer_ph",
        label: "Buffer (Henderson-Hasselbalch)",
        fields: [
          field("acid_concentration_m", "[HA]", { placeholder: "0.100" }),
          field("base_concentration_m", "[A-]", { placeholder: "0.100" }),
          field("pka", "pKa", { placeholder: "4.74" }),
        ],
      },
      {
        id: "titration_concentration",
        label: "Titration",
        fields: [
          field("titrant_concentration_m", "Titrant (M)", { placeholder: "0.100" }),
          field("titrant_volume_l", "Titrant volume (L)", { placeholder: "0.0250" }),
          field("analyte_volume_l", "Analyte volume (L)", { placeholder: "0.0200" }),
        ],
      },
      {
        id: "percent_by_mass",
        label: "Percent by mass",
        fields: [
          field("solute_mass_g", "Solute (g)", { placeholder: "5.0" }),
          field("solution_mass_g", "Solution (g)", { placeholder: "100.0" }),
        ],
      },
    ],
    buildPayload(type, values, steps) {
      const payload = { task: type.id, steps };
      for (const key of [
        "formula",
        "mass_g",
        "volume_l",
        "concentration_m",
        "initial_concentration_m",
        "initial_volume_l",
        "final_concentration_m",
        "final_volume_l",
        "ka",
        "kb",
        "pka",
        "acid_concentration_m",
        "base_concentration_m",
        "titrant_concentration_m",
        "titrant_volume_l",
        "analyte_volume_l",
        "solute_mass_g",
        "solution_mass_g",
      ]) {
        const value = key === "formula" ? values[key] || null : number(values[key]);
        if (value !== null) payload[key] = value;
      }
      if (number(values.protons)) payload.protons = Math.round(number(values.protons));
      if (number(values.hydroxides)) {
        payload.hydroxides = Math.round(number(values.hydroxides));
      }
      return payload;
    },
    check(type, values, steps) {
      return checkSolutions(this.buildPayload(type, values, steps));
    },
    session(type, values, problem) {
      return {
        topic: "solutions",
        problem,
        solutions: this.buildPayload(type, values, [
          { line_number: 1, smiles: "0" },
        ]),
      };
    },
  },

  {
    id: "balancing",
    label: "Equations & balancing",
    glyph: "⇌",
    blurb: "Balance an equation, or reduce one to its net ionic form.",
    input: "equation",
    answerPlaceholder: "e.g. 2H2 + O2 -> 2H2O",
    types: [
      {
        id: "balance",
        label: "Balance the equation",
        fields: [
          field("reference_equation", "Unbalanced equation", {
            placeholder: "C3H8 + O2 -> CO2 + H2O",
          }),
        ],
      },
      {
        id: "net_ionic",
        label: "Net ionic equation",
        fields: [
          field("molecular_equation", "Molecular equation", {
            placeholder: "AgNO3 + NaCl -> AgCl + NaNO3",
          }),
        ],
      },
    ],
    check(type, values, steps) {
      const equationSteps = steps.map((step) => ({
        line_number: step.line_number,
        equation: step.smiles,
      }));
      if (type.id === "net_ionic") {
        return checkNetIonic(values.molecular_equation, equationSteps);
      }
      return checkBalance(values.reference_equation, equationSteps);
    },
    session(type, values, problem) {
      return {
        topic: "balancing",
        problem,
        reference_equation:
          type.id === "net_ionic"
            ? values.molecular_equation
            : values.reference_equation,
      };
    },
  },

  {
    id: "redox",
    label: "Redox & electrochemistry",
    glyph: "⚡",
    blurb: "Half-reactions, oxidation states, standard cell potentials.",
    input: "mixed",
    answerPlaceholder: "e.g. +6, or 1.10 V",
    types: [
      {
        id: "half_reaction",
        label: "Balance a half-reaction",
        input: "equation",
        fields: [
          field("reference_equation", "Half-reaction", {
            placeholder: "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O",
          }),
        ],
      },
      {
        id: "oxidation_state",
        label: "Oxidation state",
        input: "numeric",
        fields: [
          field("formula", "Species", { placeholder: "Cr2O7^2-" }),
          field("element", "Element", { placeholder: "Cr" }),
        ],
      },
      {
        id: "cell_potential",
        label: "Standard cell potential",
        input: "numeric",
        fields: [
          field("cathode", "Cathode half-reaction", {
            placeholder: "Cu^2+ + 2e- -> Cu",
          }),
          field("anode", "Anode half-reaction", {
            placeholder: "Zn^2+ + 2e- -> Zn",
          }),
        ],
      },
    ],
    check(type, values, steps) {
      if (type.id === "oxidation_state") {
        return checkOxidationState(values.formula, values.element, steps);
      }
      if (type.id === "cell_potential") {
        return checkCellPotential(values.cathode, values.anode, steps);
      }
      return checkBalance(
        values.reference_equation,
        steps.map((step) => ({
          line_number: step.line_number,
          equation: step.smiles,
        }))
      );
    },
    session(type, values, problem) {
      if (type.id === "half_reaction") {
        return {
          topic: "redox",
          problem,
          reference_equation: values.reference_equation,
        };
      }
      return null; // solved server-side per request; no vault needed yet
    },
  },

  {
    id: "structure",
    label: "Structure & bonding",
    glyph: "⬡",
    blurb: "Draw a structure, or draw an isomer of one.",
    input: "drawing",
    answerPlaceholder: "SMILES read from your drawing",
    types: [
      {
        id: "match_structure",
        label: "Draw this structure",
        fields: [
          field("target_smiles", "Target (SMILES)", { placeholder: "CC(=O)OC" }),
        ],
      },
      {
        id: "isomer",
        label: "Draw an isomer",
        fields: [
          field("reference_smiles", "Reference (SMILES)", { placeholder: "CCO" }),
          {
            name: "isomer_type",
            label: "Kind",
            type: "select",
            options: ["constitutional", "stereo", "any"],
          },
        ],
      },
    ],
    check(type, values, steps) {
      if (type.id === "isomer") {
        return checkIsomer(
          values.reference_smiles,
          values.isomer_type || "constitutional",
          steps
        );
      }
      return checkStructure(values.target_smiles, steps);
    },
    session(type, values, problem) {
      if (type.id === "isomer") return null;
      return { topic: "structure", problem, target_smiles: values.target_smiles };
    },
  },

  {
    id: "organic",
    label: "Organic chemistry",
    glyph: "🧬",
    blurb: "Functional groups, IUPAC naming, and reaction products.",
    input: "drawing",
    answerPlaceholder: "SMILES read from your drawing",
    types: [
      {
        id: "functional_group",
        label: "Draw a molecule with this group",
        fields: [
          {
            name: "target_group",
            label: "Group",
            type: "select",
            options: FUNCTIONAL_GROUPS,
          },
        ],
      },
      {
        id: "naming",
        label: "Name this structure",
        input: "text",
        answerPlaceholder: "e.g. methyl ethanoate",
        fields: [
          field("target_smiles", "Structure (SMILES)", { placeholder: "CC(=O)OC" }),
        ],
      },
      {
        id: "draw_from_name",
        label: "Draw this named compound",
        fields: [field("target_name", "Name", { placeholder: "propan-2-ol" })],
      },
      {
        id: "reaction",
        label: "Predict the product",
        fields: [
          field("reactants_smiles", "Starting material (SMILES)", {
            placeholder: "C=C",
          }),
          field("reagent", "Reagent / conditions", { placeholder: "H2, Pd" }),
          {
            name: "reaction_type",
            label: "Reaction type",
            type: "select",
            options: REACTION_TYPES,
          },
        ],
      },
    ],
    check(type, values, steps) {
      if (type.id === "functional_group") {
        return checkFunctionalGroup(values.target_group || "ester", steps);
      }
      if (type.id === "naming" || type.id === "draw_from_name") {
        return checkName(values.target_smiles, values.target_name, steps);
      }
      return checkReaction({
        reactants_smiles: (values.reactants_smiles || "")
          .split(/[.\s,]+/)
          .filter(Boolean),
        reagent: values.reagent || null,
        reaction_type: values.reaction_type || null,
        steps,
      });
    },
    session(type, values, problem) {
      if (type.id === "functional_group") {
        return {
          topic: "organic",
          problem,
          target_group: values.target_group || "ester",
        };
      }
      if (type.id === "naming" && values.target_smiles) {
        return { topic: "organic", problem, target_smiles: values.target_smiles };
      }
      return null;
    },
  },
];

export const TOPIC_BY_ID = Object.fromEntries(
  TOPICS.map((topic) => [topic.id, topic])
);

export function inputModeFor(topic, type) {
  return type?.input ?? topic?.input ?? "drawing";
}

// A one-line statement of the problem, used as the session's `problem` and
// shown above the canvas so a student can see what they are answering.
export function describeProblem(topic, type, values) {
  const parts = type.fields
    .map((f) => {
      const value = values[f.name];
      return value ? `${f.label}: ${value}` : null;
    })
    .filter(Boolean);
  return `${topic.label} - ${type.label}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

export function isProblemReady(type, values) {
  return type.fields
    .filter((f) => f.optional !== true && !/optional/i.test(f.label))
    .every((f) => {
      if (f.type === "select") return true;
      // Dilution deliberately leaves one of the four blank; the backend
      // solves for whichever it is, so an empty field there is not an error.
      if (f.placeholder && /leave blank/i.test(f.placeholder)) return true;
      return Boolean((values[f.name] || "").trim());
    });
}
