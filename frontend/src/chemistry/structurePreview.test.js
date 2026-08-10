import { describe, expect, it } from "vitest";

import {
  isTrustedStructurePreview,
  trustedStructurePreview,
} from "./structurePreview";

describe("structure preview trust boundary", () => {
  it("wraps only an RDKit endpoint response as trusted preview data", () => {
    const preview = trustedStructurePreview({
      svg: "<svg data-rendered-by=rdkit></svg>",
      formula: "C2H6O",
      generic: false,
    });

    expect(Object.isFrozen(preview)).toBe(true);
    expect(isTrustedStructurePreview(preview)).toBe(true);
  });

  it("does not render an unwrapped or shape-forged SVG string", () => {
    expect(isTrustedStructurePreview({ svg: "<svg>model output</svg>" })).toBe(false);
    expect(
      isTrustedStructurePreview({
        svg: "<svg>model output</svg>",
        source: "rdkit-render-endpoint",
      })
    ).toBe(false);
    expect(trustedStructurePreview(null)).toBe(null);
  });

  it("does not transfer trust through object copying", () => {
    const preview = trustedStructurePreview({ svg: "<svg></svg>" });

    expect(isTrustedStructurePreview({ ...preview })).toBe(false);
  });
});
