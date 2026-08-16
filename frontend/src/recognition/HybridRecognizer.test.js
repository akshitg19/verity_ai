import { afterEach, describe, expect, it, vi } from "vitest";

import GeminiImageRecognizer from "./GeminiImageRecognizer";
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

  it("does not render a PNG when the vector primary is usable", async () => {
    const render = vi.fn(async () => "data:image/png;base64,cG5n");
    const transcribe = vi.fn(async () => ({ text: "fallback" }));
    const primary = provider("vector", async () => ({
      text: "x = 2",
      parseable: true,
    }));
    const recognizer = new HybridRecognizer({
      primary,
      fallback: new GeminiImageRecognizer({ render, transcribe }),
    });

    await expect(recognizer.recognize({ strokes: [{ id: 1 }] })).resolves
      .toMatchObject({ text: "x = 2", fallbackUsed: false });
    expect(render).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("renders the original strokes only after an unusable vector result", async () => {
    const strokes = [{ id: 1, points: [{ x: 1, y: 2 }] }];
    const render = vi.fn(async () => "data:image/png;base64,cG5n");
    const transcribe = vi.fn(async () => ({ text: "x = 3" }));
    const primary = provider("vector", async () => {
      expect(render).not.toHaveBeenCalled();
      return { text: "3x +", parseable: false };
    });
    const recognizer = new HybridRecognizer({
      primary,
      fallback: new GeminiImageRecognizer({ render, transcribe }),
    });

    await expect(recognizer.recognize({ strokes })).resolves.toMatchObject({
      text: "x = 3",
      source: "gemini",
      fallbackUsed: true,
      fallbackReason: FALLBACK_REASONS.UNPARSEABLE,
    });
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(strokes);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("propagates a fallback outage without retrying or recursing", async () => {
    const primary = provider("vector", async () => {
      throw new Error("primary offline");
    });
    const fallback = provider("gemini", async () => {
      throw new Error("fallback offline");
    });
    const recognizer = new HybridRecognizer({ primary, fallback });

    await expect(recognizer.recognize({ strokes: [{}] }))
      .rejects.toThrow("fallback offline");
    expect(primary.recognize).toHaveBeenCalledTimes(1);
    expect(fallback.recognize).toHaveBeenCalledTimes(1);
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

  it("aborts timed-out primary work before the one fallback attempt", async () => {
    vi.useFakeTimers();
    let primarySignal;
    const primary = provider("vector", ({ signal }) => {
      primarySignal = signal;
      return new Promise(() => {});
    });
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
    expect(primarySignal.aborted).toBe(true);
    expect(primary.recognize).toHaveBeenCalledTimes(1);
    expect(fallback.recognize).toHaveBeenCalledTimes(1);
  });

  it("does not start fallback when the caller cancels during primary work", async () => {
    const controller = new AbortController();
    const primary = provider("vector", async () => {
      controller.abort(new DOMException("page changed", "AbortError"));
      throw new Error("primary stopped");
    });
    const fallback = provider("gemini", async () => ({ text: "x = 1" }));
    const recognizer = new HybridRecognizer({ primary, fallback });

    const failure = await recognizer.recognize({
      strokes: [{}],
      signal: controller.signal,
    }).then(() => null, (error) => error);
    expect(failure.name).toBe("AbortError");
    expect(failure.message).toBe("Recognition was cancelled.");
    expect(fallback.recognize).not.toHaveBeenCalled();
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
