import { describe, expect, it } from "vitest";

import {
  createRecognitionLifecycleTrace,
  createRecognitionTrace,
  emitRecognitionMetric,
  RECOGNITION_METRIC_EVENT,
} from "./recognitionMetrics";

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

  it("records pointer-to-paint stages without page or answer content", () => {
    let clock = 100;
    const emitted = [];
    const trace = createRecognitionLifecycleTrace({
      provider: "vector",
      mode: "vector",
      expressionVersion: 7,
      pageId: "private",
      text: "student answer",
    }, {
      startedAt: 80,
      now: () => clock,
      emit: (record) => emitted.push(record),
    });
    trace.markAt("pointer_up", 80);
    trace.markAt("expression_ready", 90);
    trace.mark("recognition_start");
    clock = 140;
    trace.mark("judge_end");
    clock = 150;
    trace.mark("result_painted");
    const record = trace.finish({ outcome: "committed" });

    expect(record).toMatchObject({
      provider: "vector",
      expressionVersion: 7,
      outcome: "committed",
      totalMs: 70,
      stages: {
        pointer_up: 0,
        expression_ready: 10,
        recognition_start: 20,
        judge_end: 60,
        result_painted: 70,
      },
    });
    expect(record).not.toHaveProperty("pageId");
    expect(JSON.stringify(emitted)).not.toContain("student answer");
  });

  it("sanitizes records again at the browser event boundary", () => {
    let detail;
    const listener = (event) => { detail = event.detail; };
    globalThis.addEventListener(RECOGNITION_METRIC_EVENT, listener, { once: true });
    emitRecognitionMetric({
      provider: "mock",
      text: "private answer",
      pageId: "private page",
      totalMs: 12,
      stages: { recognition_start: 2, private_stage: 3 },
    });
    expect(detail).toEqual({
      provider: "mock",
      totalMs: 12,
      stages: { recognition_start: 2 },
    });
  });
});
