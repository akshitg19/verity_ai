import { describe, expect, it, vi } from "vitest";

import MyScriptVectorRecognizer, {
  myscriptRequestPayload,
  providerFailure,
} from "./MyScriptVectorRecognizer";

const strokes = [
  {
    id: "local-stroke-id",
    pointerType: "pen",
    color: "#private-presentation-field",
    width: 7,
    points: [
      { x: 4, y: 9, t: 100.25, p: 0 },
      { x: 6, y: 11, t: 101.75, p: 0.45 },
    ],
  },
  {
    pointerType: "unknown-device",
    points: [{ x: 20, y: 3, t: 200, p: 1 }],
  },
];

describe("MyScriptVectorRecognizer", () => {
  it("sends ordered vector ink without rendering PNG or forwarding local metadata", async () => {
    const recognize = vi.fn(async () => ({
      text: "x=3",
      unreadable: false,
      format: "ascii",
      source: "myscript",
      provisional: false,
      candidates: ["x=3"],
      latency_ms: 42,
    }));
    const metrics = [];
    let clock = 0;
    const recognizer = new MyScriptVectorRecognizer({
      recognize,
      now: () => ++clock,
      emitMetric: (record) => metrics.push(record),
    });

    expect(recognizer).toMatchObject({
      inputMode: "vector",
      supportsProvisional: false,
      autoFinalize: false,
    });

    await expect(recognizer.recognize({
      strokes,
      topic: "algebra",
      expressionVersion: 8,
      pageId: "private-page",
      previousText: "private-answer",
    })).resolves.toMatchObject({
      text: "x=3",
      source: "myscript",
      format: "ascii",
      provisional: false,
      unreadable: false,
      latencyMs: 42,
    });

    expect(recognize).toHaveBeenCalledWith({
      schema_version: 1,
      profile: "linear-equation-v1",
      strokes: [
        {
          pointer_type: "pen",
          points: [
            { x: 4, y: 9, t: 100.25, p: 0 },
            { x: 6, y: 11, t: 101.75, p: 0.45 },
          ],
        },
        { points: [{ x: 20, y: 3, t: 200, p: 1 }] },
      ],
      dpi_x: 96,
      dpi_y: 96,
    }, { signal: undefined });
    const serialized = JSON.stringify(recognize.mock.calls[0][0]);
    expect(serialized).not.toContain("image");
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("local-stroke-id");
    expect(serialized).not.toContain("private");
    expect(metrics[0]).toMatchObject({
      provider: "myscript",
      mode: "vector",
      expressionVersion: 8,
      outcome: "success",
    });
    expect(JSON.stringify(metrics)).not.toContain("x=3");
    expect(JSON.stringify(metrics)).not.toContain("private");
  });

  it("rejects non-algebra topics and invalid ink before opening the API", async () => {
    const recognize = vi.fn();
    const recognizer = new MyScriptVectorRecognizer({ recognize });

    await expect(recognizer.recognize({ strokes, topic: "calculus" }))
      .rejects.toMatchObject({ code: "unsupported_topic" });
    await expect(recognizer.recognize({
      strokes: [{ points: [{ x: Number.NaN, y: 1 }] }],
      topic: "algebra",
    })).rejects.toMatchObject({ code: "invalid_vector_ink" });
    expect(recognize).not.toHaveBeenCalled();
  });

  it("preserves cancellation and never maps it to a provider failure", async () => {
    const controller = new AbortController();
    const recognize = vi.fn((_payload, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const recognizer = new MyScriptVectorRecognizer({ recognize });
    const result = recognizer.recognize({
      strokes,
      topic: "algebra",
      signal: controller.signal,
    });

    controller.abort(new DOMException("edited", "AbortError"));
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each([
    [504, "timeout"],
    [422, "unsupported_format"],
    [404, "provider_disabled"],
    [429, "provider_budget_unavailable"],
    [503, "service_error"],
  ])("maps HTTP %s to content-safe code %s", (status, code) => {
    const error = providerFailure({
      status,
      message: "private provider response",
      details: { label: "private handwriting" },
    });

    expect(error).toMatchObject({ code, source: "myscript" });
    expect(error.message).not.toContain("private");
    expect(error.cause).toBeUndefined();
  });

  it("builds a new payload without mutating the captured strokes", () => {
    const before = structuredClone(strokes);
    const payload = myscriptRequestPayload(strokes);

    expect(strokes).toEqual(before);
    expect(payload.strokes[0]).not.toBe(strokes[0]);
    expect(payload.strokes[0].points[0]).not.toBe(strokes[0].points[0]);
  });
});
