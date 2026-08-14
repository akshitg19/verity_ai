import { describe, expect, it } from "vitest";

import {
  normalizeRecognitionResult,
  RecognitionError,
  throwIfAborted,
} from "./recognitionTypes";

describe("recognition result normalization", () => {
  it("normalizes provider output without inventing confidence", () => {
    expect(normalizeRecognitionResult({
      text: " 3*x + 2 = 5 ",
      candidates: ["3x + 2 = 5", { text: "3*x + 2 = 5", confidence: 0.8 }],
    }, { source: "test" })).toMatchObject({
      text: "3*x + 2 = 5",
      format: "ascii",
      source: "test",
      parseable: true,
      unreadable: false,
      fallbackUsed: false,
    });
  });

  it("does not expose text when a provider marks ink unreadable", () => {
    expect(normalizeRecognitionResult({ text: "guess", unreadable: true })).toMatchObject({
      text: "",
      unreadable: true,
      parseable: false,
    });
  });

  it("stops before work begins when already cancelled", () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    expect(() => throwIfAborted(controller.signal)).toThrowError(/cancelled/);
    expect(new RecognitionError("failed", { code: "test" })).toMatchObject({
      name: "RecognitionError",
      code: "test",
    });
  });
});

