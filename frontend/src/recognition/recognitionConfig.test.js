import { describe, expect, it, vi } from "vitest";

import HybridRecognizer from "./HybridRecognizer";
import ShadowRecognizer from "./ShadowRecognizer";
import {
  createConfiguredRecognizer,
  HANDWRITING_MODES,
  resolveHandwritingMode,
} from "./recognitionConfig";

function provider(source, text) {
  return { source, recognize: vi.fn(async () => ({ text })) };
}

describe("recognition configuration", () => {
  it("defaults unknown configuration to Gemini-only", () => {
    expect(resolveHandwritingMode("not-a-mode")).toBe(HANDWRITING_MODES.GEMINI);
    const gemini = provider("gemini", "x = 1");
    expect(createConfiguredRecognizer({ mode: "invalid", gemini })).toBe(gemini);
  });

  it("only constructs hybrid or shadow modes when a primary exists", () => {
    const gemini = provider("gemini", "x = 1");
    const primary = {
      ...provider("vector", "x = 1"),
      inputMode: "vector",
      supportsProvisional: true,
    };
    const hybrid = createConfiguredRecognizer({
      mode: HANDWRITING_MODES.HYBRID,
      gemini,
      primary,
    });
    expect(hybrid).toBeInstanceOf(HybridRecognizer);
    expect(hybrid).toMatchObject({ inputMode: "vector", supportsProvisional: true });
    const shadow = createConfiguredRecognizer({
      mode: HANDWRITING_MODES.SHADOW,
      gemini,
      primary,
    });
    expect(shadow).toBeInstanceOf(ShadowRecognizer);
    expect(shadow.inputMode).toBe("image");
    expect(createConfiguredRecognizer({
      mode: HANDWRITING_MODES.HYBRID,
      gemini,
    })).toBe(gemini);
  });

  it("keeps shadow candidate output away from the user result", async () => {
    const reports = [];
    const recognizer = createConfiguredRecognizer({
      mode: HANDWRITING_MODES.SHADOW,
      gemini: provider("gemini", "student wrote this"),
      primary: provider("vector", "candidate disagrees"),
      onShadowResult: (report) => reports.push(report),
    });
    await expect(recognizer.recognize({ strokes: [{}] })).resolves.toMatchObject({
      text: "student wrote this",
      source: "gemini",
    });
    await vi.waitFor(() => expect(reports).toHaveLength(1));
    expect(reports[0].result.text).toBe("candidate disagrees");
  });
});
