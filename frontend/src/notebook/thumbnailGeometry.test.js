import { describe, expect, it } from "vitest";

import { thumbnailPaths } from "./thumbnailGeometry";

const stroke = (points, color) => ({ points, color });

describe("thumbnailPaths", () => {
  it("returns null for a page with no ink", () => {
    expect(thumbnailPaths([])).toBeNull();
    expect(thumbnailPaths(undefined)).toBeNull();
  });

  it("ignores a stroke with no points", () => {
    expect(thumbnailPaths([stroke([])])).toBeNull();
  });

  it("keeps the stroke colour", () => {
    const paths = thumbnailPaths([
      stroke([{ x: 0, y: 0 }, { x: 10, y: 10 }], "#a94a4a"),
    ]);

    expect(paths).toHaveLength(1);
    expect(paths[0].color).toBe("#a94a4a");
  });

  it("fits the ink inside the viewbox", () => {
    // A page written anywhere on a large canvas has to land inside the small
    // box, or the thumbnail is blank while the page is full.
    const paths = thumbnailPaths([
      stroke([
        { x: 900, y: 1200 },
        { x: 1400, y: 1600 },
      ]),
    ]);

    const numbers = paths[0].points
      .split(" ")
      .flatMap((pair) => pair.split(",").map(Number));

    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(130);
  });

  it("does not stretch a wide line into the full height", () => {
    // One long horizontal line should stay a line, not become a diagonal.
    const paths = thumbnailPaths([
      stroke([
        { x: 0, y: 0 },
        { x: 500, y: 0 },
      ]),
    ]);
    const ys = paths[0].points.split(" ").map((pair) => Number(pair.split(",")[1]));

    expect(new Set(ys).size).toBe(1);
  });

  it("caps how many strokes are drawn", () => {
    const many = Array.from({ length: 400 }, (_, index) =>
      stroke([
        { x: index, y: 0 },
        { x: index, y: 5 },
      ])
    );

    expect(thumbnailPaths(many)).toHaveLength(140);
  });
});
