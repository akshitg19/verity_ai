import { describe, expect, it } from "vitest";

import { TOPICS } from "./topics";
import {
  MIN_WORKING_ROWS,
  ZONES,
  buildWorksheet,
  growWorkingRows,
  hasWorksheet,
  isReadableRow,
  promptAtRow,
  promptsComplete,
  zoneAtRow,
} from "./worksheet";

const stoichiometry = TOPICS.find((topic) => topic.id === "stoichiometry");
const molarMass = stoichiometry.types.find((type) => type.id === "molar_mass");
const percentYield = stoichiometry.types.find(
  (type) => type.id === "percent_yield"
);
const structure = TOPICS.find((topic) => topic.id === "structure");

describe("which topics get a worksheet", () => {
  it("covers the numeric topics", () => {
    expect(hasWorksheet(stoichiometry, molarMass)).toBe(true);
  });

  it("leaves drawing topics on the row-by-row path", () => {
    expect(hasWorksheet(structure, structure.types[0])).toBe(false);
    expect(buildWorksheet(structure, structure.types[0])).toBeNull();
  });
});

describe("layout", () => {
  it("puts one prompt above the working and the answer below it", () => {
    const sheet = buildWorksheet(stoichiometry, molarMass);
    expect(sheet.prompts.map((prompt) => prompt.key)).toEqual(["formula"]);
    expect(sheet.workingStart).toBe(1);
    expect(sheet.answerRow).toBe(1 + MIN_WORKING_ROWS);
    expect(sheet.answerUnit).toBe("g/mol");
    expect(sheet.title).toBe("Molar mass");
  });

  it("gives every field of a multi-field type its own row", () => {
    const sheet = buildWorksheet(stoichiometry, percentYield);
    expect(sheet.prompts.map((prompt) => prompt.key)).toEqual([
      "equation",
      "amounts",
      "product",
      "actual_yield_g",
    ]);
    expect(sheet.workingStart).toBe(4);
  });

  it("strips the unit out of the label and prints it separately", () => {
    const sheet = buildWorksheet(stoichiometry, percentYield);
    const collected = sheet.prompts.find(
      (prompt) => prompt.key === "actual_yield_g"
    );
    expect(collected.label).toBe("Mass you collected");
    expect(collected.unit).toBe("g");
  });
});

describe("zones", () => {
  const sheet = buildWorksheet(stoichiometry, molarMass);

  it("names each band", () => {
    expect(zoneAtRow(sheet, 0)).toBe(ZONES.PROMPT);
    expect(zoneAtRow(sheet, 1)).toBe(ZONES.WORKING);
    expect(zoneAtRow(sheet, sheet.answerRow - 1)).toBe(ZONES.WORKING);
    expect(zoneAtRow(sheet, sheet.answerRow)).toBe(ZONES.ANSWER);
    expect(zoneAtRow(sheet, sheet.answerRow + 1)).toBeNull();
  });

  it("reads the prompt and the answer, never the working", () => {
    expect(isReadableRow(sheet, 0)).toBe(true);
    expect(isReadableRow(sheet, sheet.answerRow)).toBe(true);
    for (let row = sheet.workingStart; row < sheet.answerRow; row += 1) {
      expect(isReadableRow(sheet, row)).toBe(false);
    }
  });

  it("maps a prompt row to the field it fills", () => {
    expect(promptAtRow(sheet, 0).key).toBe("formula");
    expect(promptAtRow(sheet, 2)).toBeNull();
    expect(promptAtRow(sheet, sheet.answerRow)).toBeNull();
  });
});

describe("the working box grows with the ink", () => {
  const sheet = buildWorksheet(stoichiometry, molarMass);

  it("starts at the minimum with nothing written", () => {
    expect(growWorkingRows(sheet, { inkRows: [] })).toBe(MIN_WORKING_ROWS);
  });

  it("keeps clear rows under the last line written", () => {
    const deepest = sheet.answerRow - 1;
    expect(growWorkingRows(sheet, { inkRows: [deepest] })).toBeGreaterThan(
      MIN_WORKING_ROWS
    );
  });

  it("ignores ink outside the working zone", () => {
    expect(growWorkingRows(sheet, { inkRows: [0] })).toBe(MIN_WORKING_ROWS);
    expect(growWorkingRows(sheet, { inkRows: [sheet.answerRow] })).toBe(
      MIN_WORKING_ROWS
    );
  });

  it("shrinks back when the working is erased", () => {
    const grown = growWorkingRows(sheet, { inkRows: [sheet.answerRow - 1] });
    expect(grown).toBeGreaterThan(MIN_WORKING_ROWS);
    expect(growWorkingRows(sheet, { inkRows: [] })).toBe(MIN_WORKING_ROWS);
  });

  it("freezes once the answer box has something in it", () => {
    // Moving a box the student is already writing in is worse than a box
    // that is a row or two short.
    expect(
      growWorkingRows(sheet, {
        inkRows: [sheet.answerRow - 1],
        answerFilled: true,
      })
    ).toBe(sheet.workingRows);
  });
});

describe("promptsComplete", () => {
  it("needs every required field", () => {
    const sheet = buildWorksheet(stoichiometry, molarMass);
    expect(promptsComplete(sheet, {})).toBe(false);
    expect(promptsComplete(sheet, { formula: "Al2(SO4)3" })).toBe(true);
  });

  it("does not wait on an optional one", () => {
    const sheet = buildWorksheet(stoichiometry, {
      label: "Made up",
      fields: [
        { name: "formula", label: "Formula", ink: "formula" },
        { name: "note", label: "Note (optional)", ink: "note" },
      ],
    });
    expect(promptsComplete(sheet, { formula: "C6H12O6" })).toBe(true);
  });

  it("waits on the element for percent composition", () => {
    // The element is the question on that type, not a refinement of it.
    const percent = stoichiometry.types.find(
      (type) => type.id === "percent_composition"
    );
    const sheet = buildWorksheet(stoichiometry, percent);
    expect(promptsComplete(sheet, { formula: "C6H12O6" })).toBe(false);
    expect(promptsComplete(sheet, { formula: "C6H12O6", element: "C" })).toBe(
      true
    );
  });
});
