import { describe, expect, it } from "vitest";

import {
  addStrokeToInkIndex,
  buildInkIndex,
  expandAndClampBounds,
  findStrokeRow,
  getCanvasBackingSize,
  getStrokeBounds,
  mergeBounds,
  rowsNearBounds,
  strokesNearBounds,
} from "./inkModel";

const stroke = (...points) => ({ points });

describe("ink index", () => {
  it("computes and merges stroke bounds", () => {
    expect(
      getStrokeBounds(stroke({ x: 5, y: 9 }, { x: 2, y: 12 }))
    ).toEqual({ minX: 2, maxX: 5, minY: 9, maxY: 12 });

    expect(
      mergeBounds(
        { minX: 2, maxX: 5, minY: 9, maxY: 12 },
        { minX: 1, maxX: 8, minY: 10, maxY: 14 }
      )
    ).toEqual({ minX: 1, maxX: 8, minY: 9, maxY: 14 });
  });

  it("expands dirty bounds without clearing outside the canvas", () => {
    expect(
      expandAndClampBounds(
        { minX: 2, maxX: 20, minY: 4, maxY: 30 },
        8,
        100,
        100
      )
    ).toEqual({ x: 0, y: 0, width: 28, height: 38 });
  });

  it("allocates a Retina backing store while capping memory growth", () => {
    expect(getCanvasBackingSize(640, 800, 2)).toEqual({
      pixelRatio: 2,
      width: 1280,
      height: 1600,
    });
    expect(getCanvasBackingSize(640, 800, 3)).toEqual({
      pixelRatio: 2,
      width: 1280,
      height: 1600,
    });
  });

  it("updates only the affected row when a stroke is appended", () => {
    const first = stroke({ x: 2, y: 10 }, { x: 8, y: 20 });
    const second = stroke({ x: 20, y: 14 }, { x: 30, y: 22 });
    const index = buildInkIndex([first]);

    expect(addStrokeToInkIndex(index, second)).toBe(0);
    expect(index.rows.get(0)).toEqual([first, second]);
    expect(index.bounds.get(0)).toEqual({
      minX: 2,
      maxX: 30,
      minY: 10,
      maxY: 22,
    });
  });

  it("builds independent row buckets for recognition snapshots", () => {
    const first = stroke({ x: 0, y: 10 }, { x: 10, y: 20 });
    const nextRow = stroke({ x: 0, y: 70 }, { x: 10, y: 80 });
    const index = buildInkIndex([first, nextRow]);

    expect([...index.rows.keys()]).toEqual([0, 1]);
    expect(index.rows.get(1)).toEqual([nextRow]);
  });

  it("narrows eraser candidates to strokes and rows touching the swept bounds", () => {
    const near = stroke({ x: 20, y: 20 }, { x: 30, y: 30 });
    const far = stroke({ x: 700, y: 700 }, { x: 720, y: 720 });
    const index = buildInkIndex([near, far]);
    const bounds = { minX: 0, maxX: 80, minY: 0, maxY: 80 };

    expect(strokesNearBounds(index, bounds)).toEqual(new Set([near]));
    expect(rowsNearBounds(index, bounds)).toEqual(new Set([0]));
  });
});

// The reported failure: `N₂ + H₂ -> NH₃` written on one visual line came back
// as `N2 + H -> NH` on line 1 and `2 3` on line 2, because each subscript's
// vertical centre fell into the next ruled band.
describe("subscripts stay on the line they belong to", () => {
  const glyph = stroke({ x: 10, y: 30 }, { x: 30, y: 70 });
  const subscript = stroke({ x: 32, y: 60 }, { x: 44, y: 85 });

  it("keeps a subscript with its parent glyph", () => {
    const index = buildInkIndex([glyph]);

    // Its centre is 72.5, which the fixed grid alone would call row 1.
    expect(addStrokeToInkIndex(index, subscript)).toBe(0);
    expect(index.rows.get(0)).toEqual([glyph, subscript]);
    expect([...index.rows.keys()]).toEqual([0]);
  });

  it("still starts a new row for ink written clear of the line above", () => {
    const index = buildInkIndex([glyph, subscript]);
    const nextLine = stroke({ x: 10, y: 140 }, { x: 30, y: 180 });

    expect(addStrokeToInkIndex(index, nextLine)).toBe(2);
    expect(index.rows.get(2)).toEqual([nextLine]);
  });

  it("refuses a join that would let one row swallow the page", () => {
    const index = buildInkIndex([glyph, subscript]);
    // Close enough to be a candidate on the gap test, but joining would make
    // the row 110px tall against a 102.4px ceiling.
    const tooTall = stroke({ x: 10, y: 88 }, { x: 30, y: 140 });

    expect(addStrokeToInkIndex(index, tooTall)).not.toBe(0);
  });

  it("reports the row a joined stroke actually landed in", () => {
    const index = buildInkIndex([glyph, subscript]);

    expect(findStrokeRow(index, subscript)).toBe(0);
    expect(findStrokeRow(index, stroke({ x: 0, y: 0 }))).toBeNull();
  });
});
