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
  checkFormulaStructure,
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
import { SLOT_KINDS, slotKindFor } from "./problemSlots";

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

// A field a student can write on the page instead of typing into the panel.
//
// `ink` is the verb the popover offers, so it reads as the thing they just
// wrote: "Use as formula" beside a formula, "Use as equation" beside an
// equation. A generic "Use as question" everywhere was the old behaviour and
// it is vague exactly where the student needs to be sure.
//
// The panel field stays either way. It stops being the way in and becomes the
// correction surface for when the handwriting was misread.
const inkField = (name, label, ink, extra = {}) =>
  field(name, label, { ...extra, ink });

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
        answerUnit: "g/mol",
        fields: [
          inkField("formula", "Formula", "formula", {
            placeholder: "H2SO4",
            prompt: "write the formula, like H2SO4",
          }),
        ],
      },
      {
        id: "percent_composition",
        label: "Percent composition",
        answerUnit: "%",
        fields: [
          inkField("formula", "Formula", "formula", {
            placeholder: "C6H12O6",
            prompt: "write the compound, like C6H12O6",
          }),
          // Was labelled "Element (optional)", which told a student it did
          // not matter when it is the whole question: the percent *of what*.
          // Required now, and the answer is that element's percent rather
          // than whichever element happens to sort last.
          inkField("element", "Element", "element", {
            placeholder: "C",
            prompt: "which element do you want the percent of?",
          }),
        ],
      },
      {
        id: "moles_from_mass",
        label: "Moles from mass",
        answerUnit: "mol",
        fields: [
          inkField("formula", "Formula", "formula", {
            placeholder: "H2O",
            prompt: "write the compound, like H2O",
          }),
          inkField("mass_g", "Mass (g)", "mass", {
            placeholder: "36.03",
            prompt: "how many grams of it do you have?",
          }),
        ],
      },
      {
        id: "mass_from_moles",
        label: "Mass from moles",
        answerUnit: "g",
        fields: [
          inkField("formula", "Formula", "formula", {
            placeholder: "NaCl",
            prompt: "write the compound, like NaCl",
          }),
          inkField("moles", "Moles", "amount in moles", {
            placeholder: "0.25",
            prompt: "how many moles of it do you have?",
          }),
        ],
      },
      {
        id: "empirical_formula",
        label: "Empirical formula",
        // No unit: the answer is a formula, not a quantity.
        fields: [
          inkField("composition", "Composition by mass %", "composition", {
            placeholder: "C: 40.0, H: 6.7, O: 53.3",
            prompt: "each element and its mass percent, like C: 40.0, H: 6.7, O: 53.3",
          }),
        ],
      },
      {
        id: "molecular_formula",
        label: "Molecular formula",
        fields: [
          inkField("composition", "Composition by mass %", "composition", {
            placeholder: "C: 40.0, H: 6.7, O: 53.3",
            prompt: "each element and its mass percent, like C: 40.0, H: 6.7, O: 53.3",
          }),
          inkField("target_molar_mass", "Molar mass (g/mol)", "molar mass", {
            placeholder: "180",
            prompt: "the molar mass the question gives you",
          }),
        ],
      },
      {
        id: "limiting_reagent",
        label: "Limiting reagent",
        // No unit: the answer is a species.
        fields: [
          inkField("equation", "Equation", "equation", {
            placeholder: "N2 + H2 -> NH3",
            prompt: "write the reaction, like N2 + H2 -> NH3",
          }),
          inkField("amounts", "Amounts (g)", "amounts", {
            placeholder: "N2: 28.0, H2: 6.0",
            prompt: "how many grams of each reactant, like N2: 28.0, H2: 6.0",
          }),
        ],
      },
      {
        id: "theoretical_yield",
        label: "Theoretical yield",
        answerUnit: "g",
        fields: [
          inkField("equation", "Equation", "equation", {
            placeholder: "N2 + H2 -> NH3",
            prompt: "write the reaction, like N2 + H2 -> NH3",
          }),
          inkField("amounts", "Amounts (g)", "amounts", {
            placeholder: "N2: 28.0, H2: 6.0",
            prompt: "how many grams of each reactant, like N2: 28.0, H2: 6.0",
          }),
          inkField("product", "Product", "product", {
            placeholder: "NH3",
            prompt: "which product are you finding the yield of?",
          }),
        ],
      },
      {
        id: "percent_yield",
        label: "Percent yield",
        answerUnit: "%",
        fields: [
          inkField("equation", "Equation", "equation", {
            placeholder: "N2 + H2 -> NH3",
            prompt: "write the reaction, like N2 + H2 -> NH3",
          }),
          inkField("amounts", "Amounts (g)", "amounts", {
            placeholder: "N2: 28.0, H2: 6.0",
            prompt: "how many grams of each reactant, like N2: 28.0, H2: 6.0",
          }),
          inkField("product", "Product", "product", {
            placeholder: "NH3",
            prompt: "which product are you finding the yield of?",
          }),
          inkField("actual_yield_g", "Mass you collected (g)", "mass collected", {
            placeholder: "25.0",
            prompt: "how many grams did the experiment actually produce?",
          }),
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
    check(type, values, steps, options) {
      const payload = this.buildPayload(type, values, steps);
      // The worksheet judges one answer box, so an intermediate written
      // there is the wrong answer rather than an honest middle line.
      if (options?.answersOnly) payload.answers_only = true;
      return checkStoichiometry(payload, options);
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
        answerUnit: "M",
        fields: [
          inkField("formula", "Solute formula", "solute", { placeholder: "NaCl", prompt: "write the solute, like NaCl" }),
          inkField("mass_g", "Mass (g)", "mass", { placeholder: "5.85", prompt: "how many grams of solute?" }),
          inkField("volume_l", "Volume (L)", "volume", { placeholder: "1.00", prompt: "what volume of solution, in litres?" }),
        ],
      },
      {
        id: "dilution",
        label: "Dilution (M1V1 = M2V2)",
        // The blank one may be a concentration or a volume, so no unit is
        // printed rather than printing a wrong one.
        fields: [
          inkField("initial_concentration_m", "M1", "starting concentration", { placeholder: "2.00", prompt: "starting concentration, in M" }),
          inkField("initial_volume_l", "V1 (L)", "starting volume", { placeholder: "0.050", prompt: "starting volume, in litres" }),
          inkField("final_concentration_m", "M2", "final concentration", { placeholder: "leave blank to solve", prompt: "final concentration, or leave this box empty to solve for it" }),
          inkField("final_volume_l", "V2 (L)", "final volume", { placeholder: "0.500", prompt: "final volume, or leave this box empty to solve for it" }),
        ],
      },
      {
        id: "strong_acid_ph",
        label: "pH of a strong acid",
        // pH is unitless. Printing a unit here would be wrong, not just noisy.
        fields: [
          inkField("concentration_m", "Concentration (M)", "concentration", { placeholder: "0.010", prompt: "concentration of the acid, in M" }),
          inkField("protons", "Protons per formula", "protons per formula", { placeholder: "1", prompt: "how many H+ does one formula unit give? 1 for HCl, 2 for H2SO4" }),
        ],
      },
      {
        id: "strong_base_ph",
        label: "pH of a strong base",
        fields: [
          inkField("concentration_m", "Concentration (M)", "concentration", { placeholder: "0.010", prompt: "concentration of the base, in M" }),
          inkField("hydroxides", "OH per formula", "OH per formula", { placeholder: "1", prompt: "how many OH- does one formula unit give? 1 for NaOH, 2 for Ca(OH)2" }),
        ],
      },
      {
        id: "weak_acid_ph",
        label: "pH of a weak acid",
        fields: [
          inkField("concentration_m", "Concentration (M)", "concentration", { placeholder: "0.100", prompt: "starting concentration of the acid, in M" }),
          inkField("ka", "Ka", "Ka", { placeholder: "1.8e-5", prompt: "the acid dissociation constant the question gives you" }),
        ],
      },
      {
        id: "weak_base_ph",
        label: "pH of a weak base",
        fields: [
          inkField("concentration_m", "Concentration (M)", "concentration", { placeholder: "0.100", prompt: "starting concentration of the base, in M" }),
          inkField("kb", "Kb", "Kb", { placeholder: "1.8e-5", prompt: "the base dissociation constant the question gives you" }),
        ],
      },
      {
        id: "buffer_ph",
        label: "Buffer (Henderson-Hasselbalch)",
        fields: [
          inkField("acid_concentration_m", "[HA]", "acid concentration", { placeholder: "0.100", prompt: "concentration of the weak acid, in M" }),
          inkField("base_concentration_m", "[A-]", "base concentration", { placeholder: "0.100", prompt: "concentration of its conjugate base, in M" }),
          inkField("pka", "pKa", "pKa", { placeholder: "4.74", prompt: "the pKa of the acid" }),
        ],
      },
      {
        id: "titration_concentration",
        label: "Titration",
        answerUnit: "M",
        fields: [
          inkField("titrant_concentration_m", "Titrant (M)", "titrant concentration", { placeholder: "0.100", prompt: "concentration of the titrant, in M" }),
          inkField("titrant_volume_l", "Titrant volume (L)", "titrant volume", { placeholder: "0.0250", prompt: "volume of titrant added, in litres" }),
          inkField("analyte_volume_l", "Analyte volume (L)", "analyte volume", { placeholder: "0.0200", prompt: "volume of the unknown you started with, in litres" }),
        ],
      },
      {
        id: "percent_by_mass",
        label: "Percent by mass",
        answerUnit: "%",
        fields: [
          inkField("solute_mass_g", "Solute (g)", "solute mass", { placeholder: "5.0", prompt: "grams of solute" }),
          inkField("solution_mass_g", "Solution (g)", "solution mass", { placeholder: "100.0", prompt: "grams of the whole solution" }),
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
    check(type, values, steps, options) {
      const payload = this.buildPayload(type, values, steps);
      // Matters most here: the pH answer group holds pH, pOH, [H+] and
      // [OH-], so without this the answer box takes the pOH for a pH.
      if (options?.answersOnly) payload.answers_only = true;
      return checkSolutions(payload, options);
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
          inkField("reference_equation", "Unbalanced equation", "equation", {
            placeholder: "C3H8 + O2 -> CO2 + H2O",
            prompt: "write the unbalanced equation, like C3H8 + O2 -> CO2 + H2O",
          }),
        ],
      },
      {
        id: "net_ionic",
        label: "Net ionic equation",
        fields: [
          inkField("molecular_equation", "Molecular equation", "equation", {
            placeholder: "AgNO3 + NaCl -> AgCl + NaNO3",
            prompt: "write the full equation, like AgNO3 + NaCl -> AgCl + NaNO3",
          }),
        ],
      },
    ],
    check(type, values, steps, options) {
      const equationSteps = steps.map((step) => ({
        line_number: step.line_number,
        equation: step.smiles,
      }));
      if (type.id === "net_ionic") {
        return checkNetIonic(values.molecular_equation, equationSteps, options);
      }
      return checkBalance(values.reference_equation, equationSteps, options);
    },
    session(type, values, problem) {
      // Net ionic sends `molecular_equation`, not `reference_equation`.
      // Sending it as the latter built a balancing vault, so the vault held
      // the balanced equation rather than the net ionic one and guarded the
      // wrong answer.
      if (type.id === "net_ionic") {
        return {
          topic: "balancing",
          problem,
          molecular_equation: values.molecular_equation,
        };
      }
      return {
        topic: "balancing",
        problem,
        reference_equation: values.reference_equation,
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
          inkField("reference_equation", "Half-reaction", "half-reaction", {
            placeholder: "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O",
            prompt: "write the unbalanced half-reaction",
          }),
        ],
      },
      {
        id: "oxidation_state",
        label: "Oxidation state",
        input: "numeric",
        // No unit: an oxidation state is a signed number, and printing one
        // beside the box would be wrong rather than merely noisy.
        fields: [
          inkField("formula", "Species", "species", {
            placeholder: "Cr2O7^2-",
            prompt: "write the ion or compound, like Cr2O7^2-",
          }),
          inkField("element", "Element", "element", {
            placeholder: "Cr",
            prompt: "which element do you want the oxidation state of?",
          }),
        ],
      },
      {
        id: "cell_potential",
        label: "Standard cell potential",
        input: "numeric",
        answerUnit: "V",
        fields: [
          inkField("cathode", "Cathode half-reaction", "cathode half-reaction", {
            placeholder: "Cu^2+ + 2e- -> Cu",
            prompt: "cathode: the half-reaction being reduced, like Cu^2+ + 2e- -> Cu",
          }),
          inkField("anode", "Anode half-reaction", "anode half-reaction", {
            placeholder: "Zn^2+ + 2e- -> Zn",
            prompt: "anode: the half-reaction being oxidised, like Zn^2+ + 2e- -> Zn",
          }),
        ],
      },
    ],
    check(type, values, steps, options) {
      if (type.id === "oxidation_state") {
        return checkOxidationState(values.formula, values.element, steps, options);
      }
      if (type.id === "cell_potential") {
        return checkCellPotential(values.cathode, values.anode, steps, options);
      }
      return checkBalance(
        values.reference_equation,
        steps.map((step) => ({
          line_number: step.line_number,
          equation: step.smiles,
        })),
        options
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
      if (type.id === "oxidation_state") {
        return {
          topic: "redox",
          problem,
          oxidation_formula: values.formula,
          oxidation_element: values.element,
        };
      }
      if (type.id === "cell_potential") {
        return {
          topic: "redox",
          problem,
          cathode: values.cathode,
          anode: values.anode,
        };
      }
      return null;
    },
  },

  {
    id: "structure",
    label: "Structure & bonding",
    glyph: "⬡",
    blurb: "Write a formula and draw it, match a structure, or draw an isomer.",
    input: "drawing",
    answerPlaceholder: "SMILES read from your drawing",
    types: [
      {
        // The one a student can start from nothing. They write `C2H6O` on the
        // page, the popover offers to take it, and then they draw. Every
        // isomer of that formula is accepted, because the question asked for
        // a structure with that formula and not for one particular molecule:
        // C2H6O is ethanol and it is also dimethyl ether, and a judge that
        // knows only one of them marks a correct drawing wrong.
        //
        // Listed first because it is the only type here whose question a
        // student can write in their own handwriting. The other two need a
        // SMILES, which is ours, not theirs.
        id: "formula_structure",
        label: "Draw a structure for this formula",
        fields: [
          inkField("target_formula", "Formula", "formula to draw", {
            placeholder: "C2H6O",
            prompt: "write the formula you want to draw, like C2H6O",
          }),
        ],
      },
      {
        // "Draw this exact structure" used to sit here as a third type. It
        // was removed: from a student's side it was indistinguishable from
        // the formula type above, because the only thing separating them was
        // a SMILES they were never shown. `checkStructure` and
        // `/chemistry/structure` are untouched and still serve it.
        //
        // The reference is a SMILES, so it is never printed. The molecule it
        // names is drawn on the page instead, which is the only honest way
        // to ask this of somebody who has never heard of SMILES.
        id: "isomer",
        label: "Draw an isomer of this",
        fields: [
          // The molecule, by its name, written on the page. A SMILES is ours
          // and a student has never seen one, so asking for a typed SMILES
          // made this question impossible to ask from the page at all: the
          // only way in was a panel field nobody working with a stylus ever
          // opens. The backend resolves a name to a structure, so "ethanol"
          // is a question and so is CCO.
          inkField("reference_name", "Molecule", "molecule", {
            placeholder: "ethanol",
            prompt: "write the molecule to find an isomer of, like ethanol",
          }),
          field("reference_smiles", "Molecule to find an isomer of (optional)", {
            placeholder: "CCO",
            optional: true,
            pictureLabel: "draw a different molecule with the same formula",
          }),
          {
            name: "isomer_type",
            label: "Kind of isomer",
            type: "select",
            options: ["constitutional", "stereo", "any"],
          },
        ],
      },
    ],
    check(type, values, steps, options) {
      if (type.id === "formula_structure") {
        return checkFormulaStructure(values.target_formula, steps, options);
      }
      // `match_structure` is no longer offered in the UI; the call is kept
      // so the endpoint stays reachable if the type comes back.
      if (type.id === "match_structure") {
        return checkStructure(values.target_smiles, steps, options);
      }
      if (type.id === "isomer") {
        return checkIsomer(
          values.reference_smiles || values.reference_name,
          values.isomer_type || "constitutional",
          steps,
          options
        );
      }
      return checkStructure(values.target_smiles, steps, options);
    },
    session(type, values, problem) {
      // The formula type guards the formula rather than a set of acceptable
      // structures. C2H6O is ethanol and it is also dimethyl ether, and the
      // question asked for the formula, so the formula is the thing a hint
      // must not hand over.
      if (type.id === "formula_structure") {
        return {
          topic: "structure",
          problem,
          target_formula: values.target_formula,
        };
      }
      // An isomer question hands the student a reference molecule, and the
      // answer is any different structure with the same formula. The
      // reference is what a hint must not simply restate.
      if (type.id === "isomer") {
        const reference = values.reference_smiles || values.reference_name;
        return reference
          ? { topic: "structure", problem, target_smiles: reference }
          : null;
      }
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
        label: "Draw any molecule containing this group",
        fields: [
          {
            name: "target_group",
            // Printed on the page as "Functional group: ester", so the
            // student can read the whole question without looking away.
            // It stays a dropdown, because it is a fixed set of eight and
            // there is nothing to write.
            label: "Functional group",
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
        // No unit: a name is not a quantity.
        fields: [
          field("target_smiles", "Structure to name", {
            placeholder: "CC(=O)OC",
            pictureLabel: "write the IUPAC name of this molecule",
          }),
        ],
      },
      {
        id: "draw_from_name",
        label: "Draw this named compound",
        fields: [
          inkField("target_name", "Name", "name", {
            placeholder: "propan-2-ol",
            prompt: "write the name of the compound, like propan-2-ol",
          }),
        ],
      },
      {
        id: "reaction",
        label: "Predict the product",
        fields: [
          // Same reasoning as the isomer reference: the starting material is
          // written by name, because that is the form a student has.
          inkField("reactant_name", "Starting material", "starting material", {
            placeholder: "ethene",
            prompt: "write the molecule you are reacting, like ethene",
          }),
          field("reactants_smiles", "Starting material (optional)", {
            placeholder: "C=C",
            optional: true,
            pictureLabel: "the molecule you are reacting",
          }),
          inkField("reagent", "Reagent / conditions", "reagent", {
            placeholder: "H2, Pd",
            prompt: "write the reagent and conditions, like H2, Pd",
          }),
          {
            name: "reaction_type",
            label: "Reaction type",
            type: "select",
            options: REACTION_TYPES,
          },
        ],
      },
    ],
    check(type, values, steps, options) {
      if (type.id === "functional_group") {
        return checkFunctionalGroup(values.target_group || "ester", steps, options);
      }
      if (type.id === "naming" || type.id === "draw_from_name") {
        return checkName(values.target_smiles, values.target_name, steps, options);
      }
      return checkReaction({
        // A name is one molecule and may contain spaces and hyphens, so it is
        // never split. Only a typed SMILES list is.
        reactants_smiles: values.reactants_smiles
          ? values.reactants_smiles.split(/[.\s,]+/).filter(Boolean)
          : [values.reactant_name].filter(Boolean),
        reagent: values.reagent || null,
        reaction_type: values.reaction_type || null,
        steps,
      }, options);
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
      // "Draw propan-2-ol" opened no session at all, which is why its hints
      // were the static floor however good the model was: no session means
      // no vault, and no vault means level 1 and level 2 never even ask.
      // The name is the question and the structure it names is the answer.
      if (type.id === "draw_from_name" && values.target_name) {
        return { topic: "organic", problem, target_name: values.target_name };
      }
      // Predicting a product: the starting material is the molecule the
      // question is about, so it is what the vault guards. The product
      // itself is the model path and has no deterministic answer to hold.
      const reactant =
        values.reactants_smiles?.split(/[.\s,]+/).filter(Boolean)[0] ||
        values.reactant_name;
      if (type.id === "reaction" && reactant) {
        return { topic: "organic", problem, target_smiles: reactant };
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

// Which field a line written on the page fills in.
//
// This used to be two field names on equation topics only, on the reasoning
// that a numeric topic would need "What is the pH of 0.100 M acetic acid,
// Ka = 1.8e-5" parsed into {task, concentration_m, ka}, which is a much
// larger problem. That reasoning was wrong about what a student writes. They
// do not write a sentence, they write `H2SO4`, and the topic is already
// chosen from the selector, so the line maps to one field with nothing to
// parse. Prose parsing is still unsolved and still not needed here.
//
// Every field carrying an `ink` verb is offered, **in declaration order, and
// only while it is still empty**. A student writes the equation on one line
// and the amounts on the next, so the popover has to offer the field that is
// still missing rather than always the first one.
const WRITTEN_QUESTION_FIELDS = ["reference_equation", "molecular_equation"];

export function questionFieldFor(topic, type, values = {}) {
  // Equation topics keep working exactly as they did, by field name, so the
  // behaviour that has been in front of students is not disturbed by the
  // widening below.
  if (inputModeFor(topic, type) === "equation") {
    const match = type.fields.find((entry) =>
      WRITTEN_QUESTION_FIELDS.includes(entry.name)
    );
    return match?.name ?? null;
  }
  // Only a field a student would write out whole is offered. That is the
  // correction to what this did before: it walked every ink field in turn,
  // which assumed somebody writes `Al: 25.0` on a line by itself, and asked
  // them to re-label rows they had already written with no way to reach back
  // and do it. A list of amounts is a list, so it gets a table in the slots
  // above the working instead. See `problemSlots.js`.
  const next = type.fields.find(
    (entry) =>
      entry.ink &&
      slotKindFor(entry) === SLOT_KINDS.LINE &&
      !String(values[entry.name] ?? "").trim()
  );
  return next?.name ?? null;
}

// The verb the popover offers for whichever field is next, so the offer names
// the thing the student just wrote rather than saying "question" every time.
export function questionVerbFor(topic, type, values = {}) {
  const name = questionFieldFor(topic, type, values);
  if (!name) return null;
  const match = type.fields.find((entry) => entry.name === name);
  return match?.ink ?? "question";
}

// The unit printed beside the answer box rather than typed into it. Null
// where the answer genuinely has no unit: a formula, a species, a pH.
export function answerUnitFor(type) {
  return type?.answerUnit ?? null;
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
