import { describe, expect, it } from "vitest";

import {
  distanceToSegment,
  getStrokeRow,
  segmentIntoLines,
  strokeTouchesPoint,
} from "./geometry";

const stroke = (...points) => ({ points });

describe("distanceToSegment", () => {
  it("measures the perpendicular distance to a line segment", () => {
    expect(
      distanceToSegment(
        { x: 5, y: 3 },
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      )
    ).toBe(3);
  });

  it("handles a zero-length segment", () => {
    expect(
      distanceToSegment(
        { x: 3, y: 4 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      )
    ).toBe(5);
  });
});

describe("strokeTouchesPoint", () => {
  it("finds a point within the eraser radius of a stroke", () => {
    const line = stroke({ x: 0, y: 10 }, { x: 20, y: 10 });

    expect(strokeTouchesPoint(line, { x: 10, y: 14 }, 5)).toBe(true);
    expect(strokeTouchesPoint(line, { x: 10, y: 16 }, 5)).toBe(false);
  });

  it("supports a single-point stroke", () => {
    const dot = stroke({ x: 10, y: 10 });

    expect(strokeTouchesPoint(dot, { x: 13, y: 14 }, 5)).toBe(true);
  });
});

describe("ruled-row segmentation", () => {
  it("assigns a stroke by its vertical center", () => {
    expect(
      getStrokeRow(stroke({ x: 0, y: 66 }, { x: 20, y: 90 }), 64)
    ).toBe(1);
  });

  it("groups strokes in the same row and preserves their order", () => {
    const first = stroke({ x: 0, y: 10 }, { x: 10, y: 20 });
    const second = stroke({ x: 15, y: 25 }, { x: 25, y: 30 });
    const nextRow = stroke({ x: 0, y: 70 }, { x: 10, y: 80 });

    const lines = segmentIntoLines([first, second, nextRow], 64);

    expect([...lines.keys()]).toEqual([0, 1]);
    expect(lines.get(0)).toEqual([first, second]);
    expect(lines.get(1)).toEqual([nextRow]);
  });
});
