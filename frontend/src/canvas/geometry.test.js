import { describe, expect, it } from "vitest";

import {
  distanceToSegment,
  eraseFromStroke,
  getStrokeRow,
  samplePath,
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

describe("eraseFromStroke", () => {
  const line = (count) => ({
    color: "#123456",
    width: 3,
    points: Array.from({ length: count }, (_, index) => ({ x: index * 10, y: 0 })),
  });

  it("leaves a stroke it does not touch alone, by identity", () => {
    const stroke = line(5);

    expect(eraseFromStroke(stroke, { x: 0, y: 500 }, 18)).toEqual([stroke]);
    expect(eraseFromStroke(stroke, { x: 0, y: 500 }, 18)[0]).toBe(stroke);
  });

  it("splits a stroke into two when the middle is rubbed out", () => {
    const result = eraseFromStroke(line(7), { x: 30, y: 0 }, 12);

    expect(result).toHaveLength(2);
    expect(result[0].points.map((p) => p.x)).toEqual([0, 10]);
    expect(result[1].points.map((p) => p.x)).toEqual([50, 60]);
  });

  it("keeps colour and width on every surviving piece", () => {
    const result = eraseFromStroke(line(7), { x: 30, y: 0 }, 12);

    for (const piece of result) {
      expect(piece.color).toBe("#123456");
      expect(piece.width).toBe(3);
    }
  });

  it("removes a stroke entirely when all of it is inside the disc", () => {
    expect(eraseFromStroke(line(3), { x: 10, y: 0 }, 60)).toEqual([]);
  });

  it("drops a one-point remnant rather than leaving a stray dot", () => {
    // Erasing at x=10 with a radius that also swallows x=0 leaves a single
    // point at x=20, which is not something the student drew.
    const result = eraseFromStroke(line(3), { x: 5, y: 0 }, 12);

    expect(result).toEqual([]);
  });

  it("does not sweep up an untouched single-point dot", () => {
    const dot = { points: [{ x: 100, y: 100 }] };

    expect(eraseFromStroke(dot, { x: 0, y: 0 }, 18)).toEqual([dot]);
  });
});

describe("samplePath", () => {
  it("fills in the gap between two pointer samples", () => {
    const points = samplePath({ x: 0, y: 0 }, { x: 30, y: 0 }, 10);

    expect(points).toEqual([
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it("always emits the destination even when the pointer barely moved", () => {
    expect(samplePath({ x: 0, y: 0 }, { x: 1, y: 0 }, 10)).toEqual([
      { x: 1, y: 0 },
    ]);
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
