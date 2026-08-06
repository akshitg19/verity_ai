import { describe, expect, it } from "vitest";

import {
  TOPICS,
  TOPIC_BY_ID,
  describeProblem,
  inputModeFor,
  isProblemReady,
  parsePairs,
} from "./topics";
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
    const percent = TOPIC_BY_ID.stoichiometry.types.find(
      (t) => t.id === "percent_composition"
    );
    expect(isProblemReady(percent, { formula: "C6H12O6" })).toBe(true);
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
