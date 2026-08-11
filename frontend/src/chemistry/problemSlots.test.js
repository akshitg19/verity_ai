import { describe, expect, it } from "vitest";

import {
  PAIR_SPLIT_RATIO,
  SLOT_KINDS,
  buildSlots,
  isWorkingRow,
  layoutSlots,
  pairColumnAt,
  slotAtRow,
  slotsComplete,
  valuesFromSlots,
  workingStartRow,
} from "./problemSlots";
import { TOPICS } from "./topics";

const stoichiometry = TOPICS.find((topic) => topic.id === "stoichiometry");
const percentYield = stoichiometry.types.find((t) => t.id === "percent_yield");
const molarMass = stoichiometry.types.find((t) => t.id === "molar_mass");

describe("what kind of slot each field gets", () => {
  it("makes the equation a line, because that is what a student writes whole", () => {
    const [equation] = buildSlots(percentYield);

    expect(equation.key).toBe("equation");
    expect(equation.kind).toBe(SLOT_KINDS.LINE);
  });

  it("makes amounts a table, because nobody writes `Al: 25.0` on its own line", () => {
    // This is the whole correction. A list of amounts is a list, so it gets
    // rows and columns rather than one more thing to write in prose.
    const amounts = buildSlots(percentYield).find((s) => s.key === "amounts");

    expect(amounts.kind).toBe(SLOT_KINDS.PAIRS);
    expect(amounts.rows).toBe(2);
  });

  it("grows the table when a problem has more than two reactants", () => {
    const amounts = buildSlots(percentYield, { pairRows: 4 })
      .find((s) => s.key === "amounts");

    expect(amounts.rows).toBe(4);
  });

  it("makes a plain number a value box", () => {
    const actual = buildSlots(percentYield).find((s) => s.key === "actual_yield_g");

    expect(actual.kind).toBe(SLOT_KINDS.VALUE);
  });
});

describe("units come out of the label and sit outside the box", () => {
  it("lifts the unit off so only the number is written", () => {
    const actual = buildSlots(percentYield).find((s) => s.key === "actual_yield_g");

    expect(actual.unit).toBe("g");
    // "Actual yield" reads like the thing you are solving for. It is not: it
    // is the number the question hands you, and percent yield is the answer.
    expect(actual.label).toBe("Mass you collected");
  });

  it("does not mistake a note in brackets for a unit", () => {
    const percentComposition = stoichiometry.types.find(
      (t) => t.id === "percent_composition"
    );
    const element = buildSlots(percentComposition).find((s) => s.key === "element");

    expect(element.unit).toBe(null);
    expect(element.optional).toBe(true);
  });

  it("leaves a label with no unit alone", () => {
    const [formula] = buildSlots(molarMass);

    expect(formula.unit).toBe(null);
    expect(formula.label).toBe("Formula");
  });
});

describe("where the problem stops and the working starts", () => {
  const layout = layoutSlots(buildSlots(percentYield));

  it("stacks the slots down the page, the table taking two rows", () => {
    // equation(1) + amounts(2) + product(1) + actual yield(1)
    expect(layout.map((s) => [s.key, s.row, s.rowSpan])).toEqual([
      ["equation", 0, 1],
      ["amounts", 1, 2],
      ["product", 3, 1],
      ["actual_yield_g", 4, 1],
    ]);
  });

  it("starts the working on the first row after the last slot", () => {
    expect(workingStartRow(layout)).toBe(5);
  });

  it("knows which slot a row feeds", () => {
    expect(slotAtRow(layout, 0).key).toBe("equation");
    expect(slotAtRow(layout, 1).key).toBe("amounts");
    expect(slotAtRow(layout, 2).key).toBe("amounts");
    expect(slotAtRow(layout, 3).key).toBe("product");
    expect(slotAtRow(layout, 5)).toBe(null);
  });

  it("tells a working row from a problem row", () => {
    expect(isWorkingRow(layout, 4)).toBe(false);
    expect(isWorkingRow(layout, 5)).toBe(true);
    expect(isWorkingRow(layout, 40)).toBe(true);
  });

  it("puts the working at the top when a type has no slots at all", () => {
    expect(workingStartRow([])).toBe(0);
    expect(isWorkingRow([], 0)).toBe(true);
  });

  it("gives a one-field type a single slot and working right under it", () => {
    const simple = layoutSlots(buildSlots(molarMass));

    expect(simple).toHaveLength(1);
    expect(workingStartRow(simple)).toBe(1);
  });
});

describe("which column of the amounts table ink landed in", () => {
  it("puts ink on the left in the species column", () => {
    expect(pairColumnAt(20, 800)).toBe("species");
  });

  it("puts ink past the split in the amount column", () => {
    expect(pairColumnAt(800 * PAIR_SPLIT_RATIO + 10, 800)).toBe("amount");
  });

  it("keeps a wide formula in the species column", () => {
    // `CuSO4` written from the left margin is a species even though it is
    // long. Splitting on where the ink starts, not where it ends, is why.
    expect(pairColumnAt(8, 800)).toBe("species");
  });

  it("does not divide by zero on a canvas with no width yet", () => {
    expect(pairColumnAt(10, 0)).toBe("species");
  });
});

describe("turning what was written into the values the judge already takes", () => {
  const layout = layoutSlots(buildSlots(percentYield));

  const written = [
    { row: 0, text: "2Al + 3CuSO4 -> Al2(SO4)3 + 3Cu" },
    { row: 1, text: "Al", column: "species" },
    { row: 1, text: "25.0", column: "amount" },
    { row: 2, text: "CuSO4", column: "species" },
    { row: 2, text: "90.0", column: "amount" },
    { row: 3, text: "Cu" },
    { row: 4, text: "30.0" },
    { row: 6, text: "n(Al) = 0.926 mol" },
  ];

  it("reads the whole problem off the page", () => {
    const values = valuesFromSlots(layout, written);

    expect(values.equation).toBe("2Al + 3CuSO4 -> Al2(SO4)3 + 3Cu");
    expect(values.product).toBe("Cu");
    expect(values.actual_yield_g).toBe("30.0");
  });

  it("builds the amounts string parsePairs already reads", () => {
    // Deliberately the existing format, so no payload builder or judge
    // changes anywhere behind this.
    expect(valuesFromSlots(layout, written).amounts).toBe("Al: 25.0, CuSO4: 90.0");
  });

  it("ignores the working rows", () => {
    const values = valuesFromSlots(layout, written);

    expect(Object.values(values)).not.toContain("n(Al) = 0.926 mol");
  });

  it("drops a half-written table row rather than sending a broken pair", () => {
    // A student mid-way through typing has a species and no amount yet. That
    // is not an error and must not reach the parser as `CuSO4: `.
    const partial = valuesFromSlots(layout, [
      { row: 1, text: "Al", column: "species" },
      { row: 1, text: "25.0", column: "amount" },
      { row: 2, text: "CuSO4", column: "species" },
    ]);

    expect(partial.amounts).toBe("Al: 25.0");
  });

  it("keeps the table rows in the order they were written", () => {
    const reversed = valuesFromSlots(layout, [
      { row: 2, text: "CuSO4", column: "species" },
      { row: 2, text: "90.0", column: "amount" },
      { row: 1, text: "Al", column: "species" },
      { row: 1, text: "25.0", column: "amount" },
    ]);

    expect(reversed.amounts).toBe("Al: 25.0, CuSO4: 90.0");
  });

  it("ignores blank ink", () => {
    expect(valuesFromSlots(layout, [{ row: 3, text: "   " }]).product).toBe(undefined);
  });
});

describe("knowing when the problem is ready to judge working against", () => {
  const layout = layoutSlots(buildSlots(percentYield));

  it("is not ready while a required slot is empty", () => {
    expect(slotsComplete(layout, { equation: "N2 + H2 -> NH3" })).toBe(false);
  });

  it("is ready once every required slot is filled", () => {
    expect(
      slotsComplete(layout, {
        equation: "N2 + 3H2 -> 2NH3",
        amounts: "N2: 28.0, H2: 6.0",
        product: "NH3",
        actual_yield_g: "30.0",
      })
    ).toBe(true);
  });

  it("does not wait on an optional slot", () => {
    const percentComposition = stoichiometry.types.find(
      (t) => t.id === "percent_composition"
    );
    const composition = layoutSlots(buildSlots(percentComposition));

    expect(slotsComplete(composition, { formula: "H2O" })).toBe(true);
  });
});

describe("every problem type in every topic lays out", () => {
  // A new type that produces no slots, or slots that overlap, would leave a
  // student with a page they cannot fill in.
  for (const topic of TOPICS) {
    for (const type of topic.types) {
      it(`${topic.id}/${type.id}`, () => {
        const layout = layoutSlots(buildSlots(type));

        expect(layout.length).toBe(type.fields.length);
        expect(workingStartRow(layout)).toBeGreaterThan(0);

        const seen = new Set();
        for (const slot of layout) {
          for (let r = slot.row; r < slot.row + slot.rowSpan; r += 1) {
            expect(seen.has(r)).toBe(false);
            seen.add(r);
          }
        }
      });
    }
  }
});
