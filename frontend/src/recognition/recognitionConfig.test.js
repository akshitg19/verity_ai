import { afterEach, describe, expect, it, vi } from "vitest";

import HybridRecognizer from "./HybridRecognizer";
import ShadowRecognizer from "./ShadowRecognizer";
import {
  createConfiguredRecognizer,
  HANDWRITING_MODES,
  resolveHandwritingMode,
  resolveMyScriptPocEnabled,
  TopicRecognizerRouter,
} from "./recognitionConfig";

function provider(source, text) {
  return { source, recognize: vi.fn(async () => ({ text })) };
}

afterEach(() => vi.unstubAllEnvs());

describe("recognition configuration", () => {
  it("defaults unknown configuration to Gemini-only", () => {
    expect(resolveHandwritingMode("not-a-mode")).toBe(HANDWRITING_MODES.GEMINI);
    const gemini = provider("gemini", "x = 1");
    expect(createConfiguredRecognizer({ mode: "invalid", gemini })).toBe(gemini);
  });

  it("requires both explicit MyScript POC gates and enables no fallback", () => {
    const gemini = provider("gemini", "gemini");
    const myscript = {
      ...provider("myscript", "vector"),
      inputMode: "vector",
      supportsProvisional: false,
    };
    const createMyScript = vi.fn(() => myscript);

    expect(resolveMyScriptPocEnabled("TRUE")).toBe(false);
    expect(resolveMyScriptPocEnabled("true")).toBe(true);
    expect(createConfiguredRecognizer({
      mode: HANDWRITING_MODES.MYSCRIPT_POC,
      gemini,
      myscriptPocEnabled: false,
      createMyScript,
    })).toBe(gemini);
    expect(createMyScript).not.toHaveBeenCalled();

    const selected = createConfiguredRecognizer({
      mode: HANDWRITING_MODES.MYSCRIPT_POC,
      gemini,
      myscriptPocEnabled: true,
      createMyScript,
    });
    expect(selected).toBe(myscript);
    expect(selected).not.toBeInstanceOf(HybridRecognizer);
    expect(selected).not.toBeInstanceOf(ShadowRecognizer);
    expect(createMyScript).toHaveBeenCalledTimes(1);
  });

  it("reads the two exact Vite gates for the default configuration path", () => {
    vi.stubEnv("VITE_HANDWRITING_MODE", "myscript-poc");
    vi.stubEnv("VITE_MYSCRIPT_POC_ENABLED", "true");
    const gemini = provider("gemini", "gemini");
    const myscript = provider("myscript", "vector");
    const createMyScript = vi.fn(() => myscript);

    expect(createConfiguredRecognizer({ gemini, createMyScript })).toBe(myscript);
    expect(createMyScript).toHaveBeenCalledTimes(1);
  });

  it("routes only Algebra to MyScript in presenter showcase mode", () => {
    const gemini = provider("gemini", "image");
    const myscript = provider("myscript", "vector");
    const createMyScript = vi.fn(() => myscript);
    const router = createConfiguredRecognizer({
      mode: HANDWRITING_MODES.ALGEBRA_SHOWCASE,
      gemini,
      myscriptPocEnabled: true,
      createMyScript,
    });

    expect(router).toBeInstanceOf(TopicRecognizerRouter);
    expect(router.forTopic("algebra")).toBe(myscript);
    expect(router.forTopic("pre-algebra")).toBe(gemini);
    expect(router.forTopic("trigonometry")).toBe(gemini);
    expect(router.forTopic("calculus")).toBe(gemini);
    expect(createMyScript).toHaveBeenCalledTimes(1);
  });

  it("keeps showcase mode on Gemini unless the second gate is explicit", () => {
    const gemini = provider("gemini", "image");
    expect(createConfiguredRecognizer({
      mode: HANDWRITING_MODES.ALGEBRA_SHOWCASE,
      gemini,
      myscriptPocEnabled: false,
    })).toBe(gemini);
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
