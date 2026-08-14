import { describe, expect, it } from "vitest";

import { createRecognitionTrace } from "./recognitionMetrics";

describe("recognition metrics", () => {
  it("records timing without copying student content into metrics", () => {
    let clock = 0;
    const emitted = [];
    const trace = createRecognitionTrace({
      provider: "mock",
      mode: "shadow",
      expressionVersion: 3,
      text: "secret student answer",
      strokes: [{ points: [{ x: 1, y: 2 }] }],
      pageId: "private-page-id",
    }, {
      now: () => ++clock,
      emit: (record) => emitted.push(record),
    });
    trace.mark("recognition_queued");
    trace.mark("request_start");
    const record = trace.finish({ fallbackUsed: false });

    expect(record).toMatchObject({
      provider: "mock",
      mode: "shadow",
      expressionVersion: 3,
      fallbackUsed: false,
    });
    expect(record).not.toHaveProperty("text");
    expect(record).not.toHaveProperty("strokes");
    expect(record).not.toHaveProperty("pageId");
    expect(JSON.stringify(emitted)).not.toContain("secret student answer");
  });
});

