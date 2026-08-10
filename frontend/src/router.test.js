import { describe, expect, it } from "vitest";

import { normalisePath } from "./router";

describe("normalisePath", () => {
  it("keeps the three real routes", () => {
    expect(normalisePath("/")).toBe("/");
    expect(normalisePath("/math")).toBe("/math");
    expect(normalisePath("/chemistry")).toBe("/chemistry");
  });

  it("ignores a trailing slash", () => {
    expect(normalisePath("/math/")).toBe("/math");
  });

  it("falls back to the landing page for anything else", () => {
    // A deep link that survives the host rewrite but names nothing must land
    // somewhere real rather than rendering an empty app.
    expect(normalisePath("/physics")).toBe("/");
    expect(normalisePath("")).toBe("/");
    expect(normalisePath(undefined)).toBe("/");
  });
});
