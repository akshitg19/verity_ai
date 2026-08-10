import { describe, expect, it } from "vitest";

import {
  isTrustedStructurePreview,
  RDKitPreviewSource,
  trustedStructurePreview,
} from "./structurePreview";

describe("structure preview trust boundary", () => {
  it("wraps only an RDKit endpoint response as trusted preview data", () => {
    const preview = trustedStructurePreview({
      svg: "<svg data-rendered-by=rdkit></svg>",
      formula: "C2H6O",
      generic: false,
    });

    expect(preview.source).toBe(RDKitPreviewSource);
    expect(isTrustedStructurePreview(preview)).toBe(true);
  });

  it("does not render an unwrapped SVG string", () => {
    expect(isTrustedStructurePreview({ svg: "<svg>model output</svg>" })).toBe(false);
    expect(trustedStructurePreview(null)).toBe(null);
  });
});
