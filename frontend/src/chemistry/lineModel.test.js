import { describe, expect, it } from "vitest";

import {
  buildChemistrySteps,
  isStaleLineResponse,
  isWholePageChemistryInput,
  keepVerdictsBeforeRow,
  mapChemistryVerdicts,
  orderedChemistryLines,
  removeChemistryLine,
  rowForChemistryLineNumber,
  upsertChemistryLine,
} from "./lineModel";

const lines = [
  { row: 4, text: "second", unreadable: false },
  { row: 1, text: "first", unreadable: false },
  { row: 7, text: "", unreadable: true },
];

describe("written chemistry line model", () => {
  it("orders rows and sends each readable row as a separate step", () => {
    expect(orderedChemistryLines(lines).map((line) => line.row)).toEqual([1, 4, 7]);
    expect(buildChemistrySteps(lines)).toEqual([
      { line_number: 1, smiles: "first" },
      { line_number: 2, smiles: "second" },
    ]);
    expect(rowForChemistryLineNumber(lines, 2)).toBe(4);
  });

  it("replaces and removes only the edited row", () => {
    const replaced = upsertChemistryLine(lines, {
      row: 4,
      text: "corrected second",
      unreadable: false,
    });
    expect(replaced).toEqual([
      lines[1],
      { row: 4, text: "corrected second", unreadable: false },
      lines[2],
    ]);
    expect(removeChemistryLine(replaced, 4).map((line) => line.row)).toEqual([1, 7]);
  });

  it("keeps earlier verdicts while invalidating the edited row and downstream rows", () => {
    const verdicts = new Map([
      [1, { status: "valid" }],
      [4, { status: "invalid" }],
      [7, { status: "valid" }],
    ]);
    expect([...keepVerdictsBeforeRow(verdicts, 4).keys()]).toEqual([1]);
  });

  it("maps backend step numbers back to the ordered canvas rows", () => {
    const mapped = mapChemistryVerdicts(
      [
        { line_number: 1, status: "valid" },
        { line_number: 2, status: "invalid" },
      ],
      lines
    );
    expect(mapped.get(1).status).toBe("valid");
    expect(mapped.get(4).status).toBe("invalid");
    expect(mapped.has(7)).toBe(false);
  });

  it("does not treat rows after an unreadable gap as adjacent steps", () => {
    const gappedLines = [
      { row: 1, text: "first", unreadable: false },
      { row: 4, text: "", unreadable: true },
      { row: 7, text: "third", unreadable: false },
    ];

    expect(buildChemistrySteps(gappedLines)).toEqual([
      { line_number: 1, smiles: "first" },
    ]);
    expect(rowForChemistryLineNumber(gappedLines, 2)).toBe(null);
    expect(
      mapChemistryVerdicts(
        [
          { line_number: 1, status: "valid" },
          { line_number: 2, status: "invalid" },
        ],
        gappedLines
      ).has(7)
    ).toBe(false);
  });

  it("rejects stale responses after a row edit or a newer request", () => {
    expect(isStaleLineResponse(2, 3, 1, 1)).toBe(true);
    expect(isStaleLineResponse(3, 3, 1, 2)).toBe(true);
    expect(isStaleLineResponse(3, 3, 2, 2)).toBe(false);
  });

  it("keeps structure drawings on the whole-page path", () => {
    expect(isWholePageChemistryInput("drawing")).toBe(true);
    expect(isWholePageChemistryInput("equation")).toBe(false);
    expect(isWholePageChemistryInput("numeric")).toBe(false);
  });
});
