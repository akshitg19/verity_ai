import { describe, expect, it } from "vitest";

import {
  isTrustedStructurePreview,
  sanitizeSvg,
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

  it("removes scripts, event handlers, and external references before display", () => {
    const preview = trustedStructurePreview({
      svg: '<svg onload="alert(1)"><script>alert(1)</script><image href="https://evil.example/x" /></svg>',
    });
    expect(preview.svg).not.toContain("script");
    expect(preview.svg).not.toContain("onload");
    expect(preview.svg).not.toContain("https://evil.example");
    expect(isTrustedStructurePreview(preview)).toBe(true);
  });

  it("rejects empty or unavailable SVG input", () => {
    expect(sanitizeSvg("")).toBe(null);
  });
});
