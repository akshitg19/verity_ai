import { describe, expect, it } from "vitest";

import {
  addStrokeToInkIndex,
  buildInkIndex,
  expandAndClampBounds,
  getCanvasBackingSize,
  getStrokeBounds,
  mergeBounds,
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
});
