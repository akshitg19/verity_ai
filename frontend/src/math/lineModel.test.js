import { describe, expect, it } from "vitest";

import {
  buildMathCheckInput,
  orderedMathLines,
  readableMathLines,
} from "./lineModel";

const gappedLines = [
  { row: 7, text: "x = 2", unreadable: false },
  { row: 1, text: "2x = 4", unreadable: false },
  { row: 4, text: "", unreadable: true },
];

describe("math line model", () => {
  it("orders rows and stops at the first unreadable gap", () => {
    expect(orderedMathLines(gappedLines).map((line) => line.row)).toEqual([1, 4, 7]);
    expect(readableMathLines(gappedLines).map((line) => line.row)).toEqual([1]);
  });

  it("does not promote a later row to the handwritten problem", () => {
    const input = buildMathCheckInput(
      [
        { row: 1, text: "", unreadable: true },
        { row: 4, text: "x = 2", unreadable: false },
      ],
      ""
    );

    expect(input.effectiveProblem).toBe("");
    expect(input.handwrittenProblemRow).toBe(null);
    expect(input.stepList).toEqual([]);
  });

  it("maps typed-problem steps back to their canvas rows", () => {
    const input = buildMathCheckInput(
      [
        { row: 5, text: "x + 2 = 4", unreadable: false },
        { row: 9, text: "x = 2", unreadable: false },
      ],
      "solve x + 2 = 4"
    );

    expect(input.effectiveProblem).toBe("solve x + 2 = 4");
    expect(input.handwrittenProblemRow).toBe(null);
    expect(input.stepList).toEqual([
      { line_number: 1, latex: "x + 2 = 4" },
      { line_number: 2, latex: "x = 2" },
    ]);
    expect(input.rowByLineNumber.get(2)).toBe(9);
  });

  it("uses the first readable row as the problem only when there is no typed problem", () => {
    const input = buildMathCheckInput(
      [
        { row: 2, text: "2x = 4", unreadable: false },
        { row: 6, text: "x = 2", unreadable: false },
      ],
      ""
    );

    expect(input.effectiveProblem).toBe("2x = 4");
    expect(input.handwrittenProblemRow).toBe(2);
    expect(input.stepList).toEqual([{ line_number: 1, latex: "x = 2" }]);
    expect(input.rowByLineNumber.get(1)).toBe(6);
  });
});
