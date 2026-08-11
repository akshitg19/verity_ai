import { describe, expect, it } from "vitest";

import { safeHintResourceUrl } from "./hintResources";

describe("hint resources", () => {
  it("allows HTTPS resources only", () => {
    expect(safeHintResourceUrl("https://example.com/read")).toBe("https://example.com/read");
    expect(safeHintResourceUrl("http://example.com/read")).toBe(null);
    expect(safeHintResourceUrl("javascript:alert(1)")).toBe(null);
  });
});
