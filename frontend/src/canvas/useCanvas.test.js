import { describe, expect, it } from "vitest";

import {
  completedRowAfterStroke,
  getCanvasDisplaySize,
  shouldAcknowledgeProcessedRow,
  shouldInvalidateCommittedRow,
} from "./useCanvas";

describe("canvas workflow state", () => {
  it("clears the active line only for the exact processed ink version", () => {
    expect(shouldAcknowledgeProcessedRow(4, 4, 3, 3)).toBe(true);
    expect(shouldAcknowledgeProcessedRow(4, 4, 4, 3)).toBe(false);
    expect(shouldAcknowledgeProcessedRow(7, 4, 3, 3)).toBe(false);
  });

  it("uses the layout rectangle supplied by the surface", () => {
    expect(getCanvasDisplaySize(390, 844).width).toBe(390);
    expect(getCanvasDisplaySize(1024, 768).width).toBe(1024);
    expect(getCanvasDisplaySize(1440, 900).width).toBe(1440);
    expect(getCanvasDisplaySize(1440, 900).height).toBeGreaterThanOrEqual(900);
  });

  it("invalidates the row that receives a boundary-crossing stroke", () => {
    expect(shouldInvalidateCommittedRow(3, 4)).toBe(true);
    expect(shouldInvalidateCommittedRow(4, 4)).toBe(false);
    expect(shouldInvalidateCommittedRow(null, 4)).toBe(false);
  });

  it("finishes the previous row when a stroke crosses into a lower row", () => {
    expect(completedRowAfterStroke(null, 3, 4)).toBe(3);
    expect(completedRowAfterStroke(3, 3, 4)).toBe(3);
    expect(completedRowAfterStroke(null, 4, 3)).toBe(null);
  });
});
