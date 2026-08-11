import { describe, expect, it } from "vitest";

import { atomTally, countFormula, parseEquation, splitTerm } from "./equationModel";

describe("countFormula", () => {
  it("counts a plain formula", () => {
    expect(countFormula("Fe2O3")).toEqual({ Fe: 2, O: 3 });
  });

  it("applies a coefficient", () => {
    expect(countFormula("H2O", 3)).toEqual({ H: 6, O: 3 });
  });

  it("handles a two-letter element next to a one-letter one", () => {
    expect(countFormula("NaCl")).toEqual({ Na: 1, Cl: 1 });
  });

  it("expands a parenthesised group", () => {
    expect(countFormula("Ca(OH)2")).toEqual({ Ca: 1, O: 2, H: 2 });
  });

  it("expands a nested polyatomic with its own subscripts", () => {
    expect(countFormula("Ca3(PO4)2")).toEqual({ Ca: 3, P: 2, O: 8 });
  });
});

describe("splitTerm", () => {
  it("separates a coefficient from its formula", () => {
    expect(splitTerm("4Fe")).toEqual({ coefficient: 4, formula: "Fe" });
    expect(splitTerm("13O2")).toEqual({ coefficient: 13, formula: "O2" });
  });

  it("defaults an absent coefficient to one", () => {
    expect(splitTerm("O2")).toEqual({ coefficient: 1, formula: "O2" });
  });
});

describe("parseEquation", () => {
  it("reads both sides", () => {
    const equation = parseEquation("4Fe + 3O2 -> 2Fe2O3");

    expect(equation.left).toEqual([
      { coefficient: 4, formula: "Fe" },
      { coefficient: 3, formula: "O2" },
    ]);
    expect(equation.right).toEqual([{ coefficient: 2, formula: "Fe2O3" }]);
  });

  it("accepts a unicode arrow", () => {
    expect(parseEquation("N2 + 3H2 → 2NH3")).not.toBeNull();
  });

  it("returns null for a line with no equation in it", () => {
    // A worked example step is often prose, and prose must render as prose
    // rather than as an empty tally.
    expect(parseEquation("Count the atoms on each side.")).toBeNull();
  });
});

describe("atomTally", () => {
  it("reports each element as balanced or not", () => {
    expect(atomTally("N2 + 2H2 -> 2NH3")).toEqual([
      { element: "N", left: 2, right: 2, balanced: true },
      { element: "H", left: 4, right: 6, balanced: false },
    ]);
  });

  it("reports every element balanced once the equation is", () => {
    const tally = atomTally("N2 + 3H2 -> 2NH3");

    expect(tally.every((row) => row.balanced)).toBe(true);
  });

  it("handles a polyatomic on both sides", () => {
    const tally = atomTally("3Ca(OH)2 + 2H3PO4 -> Ca3(PO4)2 + 6H2O");

    expect(tally.every((row) => row.balanced)).toBe(true);
  });
});
