import { afterEach, describe, expect, it, vi } from "vitest";

import HybridRecognizer from "./HybridRecognizer";
import { FALLBACK_REASONS } from "./recognitionTypes";

afterEach(() => {
  vi.useRealTimers();
});

function provider(source, implementation) {
  return { source, recognize: vi.fn(implementation) };
}

describe("HybridRecognizer", () => {
  it("returns a successfully recognized wrong answer without fallback", async () => {
    const primary = provider("vector", async () => ({ text: "x = 2", parseable: true }));
    const fallback = provider("gemini", async () => ({ text: "x = 1" }));
    const recognizer = new HybridRecognizer({ primary, fallback });

    await expect(recognizer.recognize({ strokes: [{}] })).resolves.toMatchObject({
      text: "x = 2",
      source: "vector",
      fallbackUsed: false,
    });
    expect(fallback.recognize).not.toHaveBeenCalled();
  });

  it.each([
    [{ text: "", unreadable: true }, FALLBACK_REASONS.UNREADABLE],
    [{ text: "" }, FALLBACK_REASONS.EMPTY],
    [{ text: "x = 1", format: "provider-private-format" }, FALLBACK_REASONS.UNSUPPORTED_FORMAT],
    [{ text: "3x +", parseable: false }, FALLBACK_REASONS.UNPARSEABLE],
  ])("falls back once for an unusable primary result", async (result, reason) => {
    const primary = provider("vector", async () => result);
    const fallback = provider("gemini", async () => ({ text: "3*x + 2 = 5" }));
    const recognizer = new HybridRecognizer({ primary, fallback });

    await expect(recognizer.recognize({ strokes: [{}] })).resolves.toMatchObject({
      text: "3*x + 2 = 5",
      source: "gemini",
      fallbackUsed: true,
      fallbackReason: reason,
    });
    expect(fallback.recognize).toHaveBeenCalledTimes(1);
  });

  it("uses the service-error reason when the primary throws", async () => {
    const primary = provider("vector", async () => { throw new Error("offline"); });
    const fallback = provider("gemini", async () => ({ text: "x = 1" }));
    const recognizer = new HybridRecognizer({ primary, fallback });
    await expect(recognizer.recognize({ strokes: [{}] })).resolves.toMatchObject({
      fallbackReason: FALLBACK_REASONS.SERVICE_ERROR,
    });
  });

  it("falls back after a bounded primary timeout", async () => {
    vi.useFakeTimers();
    const primary = provider("vector", () => new Promise(() => {}));
    const fallback = provider("gemini", async () => ({ text: "x = 1" }));
    const recognizer = new HybridRecognizer({
      primary,
      fallback,
      primaryTimeoutMs: 25,
    });
    const result = recognizer.recognize({ strokes: [{}] });
    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toMatchObject({
      fallbackUsed: true,
      fallbackReason: FALLBACK_REASONS.TIMEOUT,
    });
  });

  it("never converts caller cancellation into fallback", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("page changed", "AbortError"));
    const primary = provider("vector", async () => ({ text: "x = 1" }));
    const fallback = provider("gemini", async () => ({ text: "x = 1" }));
    const recognizer = new HybridRecognizer({ primary, fallback });
    await expect(recognizer.recognize({ strokes: [{}], signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(primary.recognize).not.toHaveBeenCalled();
    expect(fallback.recognize).not.toHaveBeenCalled();
  });
});
