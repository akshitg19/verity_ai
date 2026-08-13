import { describe, expect, it } from "vitest";

import { TOPICS, TOPIC_BY_ID } from "./topics";
import {
  KINDS,
  MIN_WORKING_ROWS,
  ZONES,
  buildWorksheet,
  growWorkingRows,
  isDrawingRow,
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

describe("three shapes of page, one per shape of question", () => {
  it("gives a numeric topic an answer box", () => {
    const sheet = buildWorksheet(stoichiometry, molarMass);
    expect(sheet.kind).toBe(KINDS.ANSWER);
    expect(sheet.answerRow).not.toBeNull();
  });

  it("gives balancing judged working and an answer box under it", () => {
    // Every working row on a steps page is still a step judged against the
    // row above. That is the behaviour balancing already had and the one
    // whose hints work, so it must survive this layout unchanged.
    //
    // The answer box below it is new. The last line of the working used to
    // be the answer by convention, which said so nowhere: nothing on the
    // page meant "this is my answer", so nothing could be marked as one.
    const balancing = TOPICS.find((topic) => topic.id === "balancing");
    const sheet = buildWorksheet(balancing, balancing.types[0]);
    expect(sheet.kind).toBe(KINDS.STEPS);
    expect(sheet.answerRow).toBe(sheet.workingStart + sheet.workingRows);
    expect(isReadableRow(sheet, sheet.workingStart)).toBe(true);
    expect(isReadableRow(sheet, sheet.answerRow)).toBe(true);
    // An equation is not measured in anything.
    expect(sheet.answerUnit).toBeNull();
  });

  it("gives a drawing topic a space to draw and reads no rows in it", () => {
    const sheet = buildWorksheet(structure, structure.types[0]);
    expect(sheet.kind).toBe(KINDS.DRAW);
    expect(sheet.answerRow).toBeNull();
    expect(isReadableRow(sheet, sheet.workingStart)).toBe(false);
    expect(isDrawingRow(sheet, sheet.workingStart)).toBe(true);
  });

  it("never asks a student to write a SMILES, and never prints one", () => {
    // A SMILES is ours, not theirs. It may occupy a row, because the page
    // has to say what the question is about, but it is always shown as a
    // drawn molecule and never as a box to write in or a string to read.
    for (const topic of TOPICS) {
      for (const type of topic.types) {
        const sheet = buildWorksheet(topic, type);
        for (const prompt of sheet.prompts) {
          if (!/smiles/i.test(prompt.key)) continue;
          expect(prompt.source).toBe("panel");
          expect(prompt.secret).toBe(true);
          expect(promptAtRow(sheet, prompt.row)).toBeNull();
          expect(isReadableRow(sheet, prompt.row)).toBe(false);
        }
      }
    }
  });

  it("keeps the question boxes out of a drawing", () => {
    const formulaStructure = structure.types.find(
      (type) => type.id === "formula_structure"
    );
    const sheet = buildWorksheet(structure, formulaStructure);
    expect(sheet.prompts.map((p) => p.key)).toEqual(["target_formula"]);
    expect(isDrawingRow(sheet, 0)).toBe(false);
    expect(isDrawingRow(sheet, sheet.workingStart)).toBe(true);
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

describe("asking for another line", () => {
  const sheet = () =>
    buildWorksheet(
      { id: "stoichiometry", input: "numeric" },
      { label: "Molar mass", fields: [{ name: "formula", label: "Formula", ink: "formula" }] },
      { inputMode: "numeric" }
    );

  it("adds a row when asked", () => {
    const worksheet = sheet();

    expect(growWorkingRows(worksheet, { addedRows: 1 })).toBe(
      growWorkingRows(worksheet, {}) + 1
    );
  });

  it("still adds a row after the answer box is filled", () => {
    // The reason this exists. Automatic growth freezes on a filled answer
    // box, which is exactly when somebody who wants one more line of working
    // finds the page will not give them one.
    const worksheet = sheet();
    const frozen = growWorkingRows(worksheet, { answerFilled: true });

    expect(growWorkingRows(worksheet, { answerFilled: true, addedRows: 3 })).toBe(
      frozen + 3
    );
  });

  it("never shrinks the box the ink is already in", () => {
    const worksheet = sheet();
    const grown = growWorkingRows(worksheet, {
      inkRows: [worksheet.workingStart + 8],
    });

    expect(
      growWorkingRows(worksheet, {
        inkRows: [worksheet.workingStart + 8],
        addedRows: 1,
      })
    ).toBeGreaterThanOrEqual(grown);
  });
});

describe("an answer box big enough for the answer", () => {
  const balancing = TOPICS.find((topic) => topic.id === "balancing");

  it("is one row until somebody asks for another", () => {
    const sheet = buildWorksheet(balancing, balancing.types[0]);

    expect(sheet.answerRows).toBe(1);
    expect(zoneAtRow(sheet, sheet.answerRow)).toBe(ZONES.ANSWER);
    expect(zoneAtRow(sheet, sheet.answerRow + 1)).toBe(null);
  });

  it("takes a second row on request", () => {
    // `2Al + 3CuSO4 -> Al2(SO4)3 + 3Cu` can run off the end of a line even
    // with the box the full width of the page.
    const sheet = buildWorksheet(balancing, balancing.types[0], {
      answerRows: 2,
    });

    expect(sheet.answerRows).toBe(2);
    expect(zoneAtRow(sheet, sheet.answerRow + 1)).toBe(ZONES.ANSWER);
    expect(isReadableRow(sheet, sheet.answerRow + 1)).toBe(true);
  });

  it("gives a drawing page no answer rows at all", () => {
    const sheet = buildWorksheet(structure, structure.types[0], {
      answerRows: 3,
    });

    expect(sheet.answerRow).toBeNull();
    expect(sheet.answerRows).toBe(0);
  });
});

describe("a question box a formula fits in", () => {
  // A stroke belongs to the row containing its vertical centre, so a
  // formula written by hand does not respect a 64px band. Write C4H10 with
  // a tall C, it centres a few pixels low, and it lands in the next row.
  // On a drawing page the next row is the figure, so the formula went to
  // the structure recogniser as part of the drawing and the question box
  // stayed empty. It read exactly like the box being ignored.
  const drawn = (topicId, typeId) => {
    const topic = TOPIC_BY_ID[topicId];
    return buildWorksheet(topic, topic.types.find((t) => t.id === typeId));
  };

  it("gives a written box two rows on a drawing page", () => {
    const sheet = drawn("structure", "formula_structure");

    expect(sheet.kind).toBe(KINDS.DRAW);
    expect(promptAtRow(sheet, 0)?.key).toBe("target_formula");
    expect(promptAtRow(sheet, 1)?.key).toBe("target_formula");
    // The row under the box is the drawing, and it starts below both.
    expect(sheet.workingStart).toBe(2);
  });

  it("keeps every drawing topic's question out of the figure", () => {
    for (const [topicId, typeId] of [
      ["structure", "formula_structure"],
      ["structure", "isomer"],
      ["organic", "draw_from_name"],
      ["organic", "reaction"],
    ]) {
      const sheet = drawn(topicId, typeId);
      const written = sheet.prompts.filter((p) => p.source === "ink");
      for (const prompt of written) {
        expect(prompt.rows).toBe(2);
        expect(isDrawingRow(sheet, prompt.row)).toBe(false);
        expect(isDrawingRow(sheet, prompt.row + 1)).toBe(false);
      }
    }
  });

  it("leaves the numeric pages on one row", () => {
    // There the row under a question box is another box or working, where
    // the same overflow is read as text and costs nothing.
    const topic = TOPIC_BY_ID.stoichiometry;
    const sheet = buildWorksheet(topic, topic.types[0]);

    expect(sheet.kind).toBe(KINDS.ANSWER);
    expect(sheet.prompts[0].rows).toBe(1);
  });
});
