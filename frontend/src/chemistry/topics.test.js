import { describe, expect, it } from "vitest";

import {
  TOPICS,
  TOPIC_BY_ID,
  answerUnitFor,
  describeProblem,
  inputModeFor,
  isProblemReady,
  parsePairs,
  questionFieldFor,
  questionVerbFor,
} from "./topics";
import { SLOT_KINDS, slotKindFor } from "./problemSlots";
import { categoryLabel } from "../components/verdictLabels";

// The pure parts of the topic table. Each of these is a place a silent bug
// costs a demo: a mis-parsed composition string sends the wrong numbers to a
// judge, and a wrong readiness check disables the only button that matters.

describe("parsePairs", () => {
  it("reads an element composition", () => {
    expect(parsePairs("C: 40.0, H: 6.7, O: 53.3")).toEqual({
      C: 40,
      H: 6.7,
      O: 53.3,
    });
  });

  it("accepts equals as well as colon", () => {
    expect(parsePairs("N2 = 28.0; H2 = 6.0")).toEqual({ N2: 28, H2: 6 });
  });

  it("accepts formulas with parentheses", () => {
    expect(parsePairs("Ca(NO3)2: 12.5")).toEqual({ "Ca(NO3)2": 12.5 });
  });

  it("ignores chunks that are not pairs", () => {
    expect(parsePairs("C: 40, nonsense, H: 6.7")).toEqual({ C: 40, H: 6.7 });
  });

  it("returns an empty object for empty input", () => {
    expect(parsePairs("")).toEqual({});
    expect(parsePairs(undefined)).toEqual({});
  });
});

describe("the topic table", () => {
  it("covers the six chemistry subjects", () => {
    expect(TOPICS.map((topic) => topic.id)).toEqual([
      "stoichiometry",
      "solutions",
      "balancing",
      "redox",
      "structure",
      "organic",
    ]);
  });

  it("gives every topic at least one problem type", () => {
    for (const topic of TOPICS) {
      expect(topic.types.length).toBeGreaterThan(0);
    }
  });

  it("gives every problem type a check function it can reach", () => {
    for (const topic of TOPICS) {
      expect(typeof topic.check).toBe("function");
    }
  });

  it("gives every field a name and a label", () => {
    for (const topic of TOPICS) {
      for (const type of topic.types) {
        for (const field of type.fields) {
          expect(field.name).toBeTruthy();
          expect(field.label).toBeTruthy();
          if (field.type === "select") {
            expect(field.options.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("indexes topics by id", () => {
    expect(TOPIC_BY_ID.structure.label).toBe("Structure & bonding");
  });
});

describe("inputModeFor", () => {
  it("falls back to the topic's mode", () => {
    const topic = TOPIC_BY_ID.structure;
    expect(inputModeFor(topic, topic.types[0])).toBe("drawing");
  });

  it("lets a problem type override its topic", () => {
    // Oxidation state is written, not drawn, even though redox as a whole
    // is mixed. Getting this wrong sends a written line to the structure
    // recogniser, which cannot read it.
    const topic = TOPIC_BY_ID.redox;
    const oxidationState = topic.types.find((t) => t.id === "oxidation_state");
    expect(inputModeFor(topic, oxidationState)).toBe("numeric");
  });

  it("routes naming to a typed answer", () => {
    const topic = TOPIC_BY_ID.organic;
    const naming = topic.types.find((t) => t.id === "naming");
    expect(inputModeFor(topic, naming)).toBe("text");
  });
});

describe("isProblemReady", () => {
  const molarMass = TOPIC_BY_ID.stoichiometry.types[0];

  it("is false while a required field is blank", () => {
    expect(isProblemReady(molarMass, {})).toBe(false);
  });

  it("is true once every required field is filled", () => {
    expect(isProblemReady(molarMass, { formula: "H2O" })).toBe(true);
  });

  it("does not require a field marked optional in its label", () => {
    // Percent composition was the example until its element became
    // required. The rule still holds; nothing ships marked optional today.
    const type = {
      fields: [
        { name: "formula", label: "Formula", type: "text" },
        { name: "note", label: "Note (optional)", type: "text" },
      ],
    };
    expect(isProblemReady(type, { formula: "C6H12O6" })).toBe(true);
  });

  it("requires the element on percent composition", () => {
    const percent = TOPIC_BY_ID.stoichiometry.types.find(
      (t) => t.id === "percent_composition"
    );
    expect(isProblemReady(percent, { formula: "C6H12O6" })).toBe(false);
    expect(isProblemReady(percent, { formula: "C6H12O6", element: "C" })).toBe(
      true
    );
  });

  it("does not require the value a dilution problem solves for", () => {
    const dilution = TOPIC_BY_ID.solutions.types.find((t) => t.id === "dilution");
    expect(
      isProblemReady(dilution, {
        initial_concentration_m: "2.0",
        initial_volume_l: "0.05",
        final_volume_l: "0.5",
      })
    ).toBe(true);
  });

  it("treats a select as always answered", () => {
    const group = TOPIC_BY_ID.organic.types[0];
    expect(isProblemReady(group, {})).toBe(true);
  });
});

describe("describeProblem", () => {
  it("states the topic, the question, and the inputs", () => {
    const topic = TOPIC_BY_ID.stoichiometry;
    const text = describeProblem(topic, topic.types[0], { formula: "H2SO4" });

    expect(text).toContain("Moles & stoichiometry");
    expect(text).toContain("Molar mass");
    expect(text).toContain("H2SO4");
  });

  it("omits fields left blank", () => {
    const topic = TOPIC_BY_ID.stoichiometry;
    const percent = topic.types.find((t) => t.id === "percent_composition");
    const text = describeProblem(topic, percent, { formula: "C6H12O6" });

    expect(text).toContain("C6H12O6");
    expect(text).not.toContain("Element");
  });
});

describe("categoryLabel", () => {
  it("names every chemistry category in plain words", () => {
    expect(categoryLabel("unbalanced_atoms")).toBe("atoms don't balance");
    expect(categoryLabel("wrong_oxidation_state")).toBe(
      "different oxidation state"
    );
  });

  it("never renders a blank for an unknown category", () => {
    // An unrecognised category must render the fallback, never nothing.
    expect(categoryLabel("something_new_entirely")).toBe(
      "something new entirely"
    );
  });

  it("returns null when there is no category at all", () => {
    expect(categoryLabel(null)).toBeNull();
    expect(categoryLabel(undefined)).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Nothing gets typed: which field a written row fills, and what unit sits
// beside the answer box rather than inside it.
// --------------------------------------------------------------------------
describe("filling the question from ink", () => {
  const stoichiometry = TOPICS.find((topic) => topic.id === "stoichiometry");
  const molarMass = stoichiometry.types.find((type) => type.id === "molar_mass");
  const percentYield = stoichiometry.types.find((type) => type.id === "percent_yield");

  it("offers the formula on a one-field type", () => {
    expect(questionFieldFor(stoichiometry, molarMass, {})).toBe("formula");
    expect(questionVerbFor(stoichiometry, molarMass, {})).toBe("formula");
  });

  it("stops offering once the only field is filled", () => {
    expect(questionFieldFor(stoichiometry, molarMass, { formula: "H2SO4" })).toBe(null);
  });

  it("offers only the equation on a multi-field type, and then stops", () => {
    // The correction. This used to walk every field in turn, which assumed a
    // student writes `Al: 25.0` on a line by itself and can reach back to
    // re-label a row they already wrote. Neither is true. The equation is the
    // one thing anyone writes out whole; the amounts, the product and the
    // collected mass go in the slots above the working instead.
    expect(questionFieldFor(stoichiometry, percentYield, {})).toBe("equation");

    const withEquation = { equation: "N2 + 3H2 -> 2NH3" };
    expect(questionFieldFor(stoichiometry, percentYield, withEquation)).toBe(null);
  });

  it("never offers a list of amounts as something to write on one line", () => {
    const amounts = percentYield.fields.find((f) => f.name === "amounts");

    expect(slotKindFor(amounts)).toBe(SLOT_KINDS.PAIRS);
    expect(questionFieldFor(stoichiometry, percentYield, { equation: "x" })).not.toBe(
      "amounts"
    );
  });

  it("treats whitespace as unfilled", () => {
    expect(questionFieldFor(stoichiometry, molarMass, { formula: "   " })).toBe("formula");
  });

  it("keeps equation topics working exactly as they did", () => {
    const balancing = TOPICS.find((topic) => topic.id === "balancing");
    const type = balancing.types[0];
    expect(questionFieldFor(balancing, type, {})).toBe("reference_equation");
  });
});

describe("the unit beside the answer box", () => {
  const stoichiometry = TOPICS.find((topic) => topic.id === "stoichiometry");
  const unitFor = (id) =>
    answerUnitFor(stoichiometry.types.find((type) => type.id === id));

  it("names the unit the student should not have to write", () => {
    expect(unitFor("molar_mass")).toBe("g/mol");
    expect(unitFor("moles_from_mass")).toBe("mol");
    expect(unitFor("mass_from_moles")).toBe("g");
    expect(unitFor("percent_composition")).toBe("%");
    expect(unitFor("percent_yield")).toBe("%");
  });

  it("has no unit where the answer is not a quantity", () => {
    // A formula and a species are not measured in anything, and printing a
    // unit beside them would be wrong rather than merely unhelpful.
    expect(unitFor("empirical_formula")).toBe(null);
    expect(unitFor("molecular_formula")).toBe(null);
    expect(unitFor("limiting_reagent")).toBe(null);
  });
});

describe("nothing gets typed, across every topic", () => {
  // The rule from final_tasks.md section 10. This test is the enforcement:
  // a new problem type that ships with a typed-only field fails here rather
  // than reaching a student who cannot write their own question.
  const EXPECTED_TYPED_ONLY = new Set([
    // SMILES is ours, not the student's. A student does not know what SMILES
    // is and must never be asked to write one as the question. These stay
    // typed on purpose and are covered by other problem types that do not.
    "target_smiles",
    "reference_smiles",
    "reactants_smiles",
    // A fixed set of choices, offered as a dropdown. Nothing to write.
    "isomer_type",
    "target_group",
    "reaction_type",
    // Balancing and net ionic already take their question from ink, by name,
    // through the older path that predates the `ink` marker.
    "reference_equation",
    "molecular_equation",
  ]);

  for (const topic of TOPICS) {
    for (const type of topic.types) {
      it(`${topic.id}/${type.id} takes its question from handwriting`, () => {
        const typedOnly = type.fields
          .filter((f) => !f.ink && f.type !== "select")
          .map((f) => f.name)
          .filter((name) => !EXPECTED_TYPED_ONLY.has(name));

        expect(typedOnly).toEqual([]);
      });
    }
  }

  it("gives structure and bonding a type a student can start from nothing", () => {
    // Every other structure type needs a SMILES for its question, which a
    // student cannot write. This one takes a formula, which they can.
    const structure = TOPICS.find((topic) => topic.id === "structure");
    const fromFormula = structure.types.find((t) => t.id === "formula_structure");

    expect(fromFormula).toBeTruthy();
    expect(questionFieldFor(structure, fromFormula, {})).toBe("target_formula");
  });
});
