import { describe, expect, it } from "vitest";

import {
  aggregateHandwritingExperimentRuns,
  percentile,
} from "./handwritingExperienceReport";

function run(variant, offset = 0) {
  return {
    schemaVersion: 1,
    experiment: "gemini-scheduling-ab-v1",
    variant,
    assessments: [{
      taskId: "linear-01",
      responsiveness: 4,
      confidence: 5,
      accuracy: "correct",
      corrections: 1,
      flickerOrIncomplete: 0,
    }],
    metrics: [
      {
        taskId: "linear-01",
        stages: {
          pointer_up: 0,
          expression_ready: 750 + offset,
          recognition_finished: 900 + offset,
          judge_end: 940 + offset,
          result_painted: 960 + offset,
        },
      },
      {
        taskId: "linear-01",
        stages: { request_start: 20, transcription_received: 120 + offset },
      },
    ],
  };
}

describe("handwriting experience report", () => {
  it("uses an interpolated percentile without mutating the input", () => {
    const values = [30, 10, 20];
    expect(percentile(values, 0.5)).toBe(20);
    expect(percentile(values, 0.95)).toBe(29);
    expect(values).toEqual([30, 10, 20]);
  });

  it("aggregates content-free lifecycle, provider, and experience results", () => {
    const report = aggregateHandwritingExperimentRuns([
      run("legacy"),
      run("current", -300),
    ]);
    expect(report.totalRuns).toBe(2);
    expect(report.variants.legacy.latency.pointerUpToPaintMs)
      .toEqual({ n: 1, p50: 960, p95: 960 });
    expect(report.variants.current.latency.providerRequestMs.p50).toBe(0);
    expect(report.variants.current.experience).toMatchObject({
      exactRecognitionRate: 1,
      correctionCount: 1,
      meanResponsiveness: 4,
    });
  });
});
