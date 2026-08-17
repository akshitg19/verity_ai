import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

import {
  aggregateHandwritingExperimentRuns,
  percentile,
  sanitizeHandwritingExperimentMetric,
  validateHandwritingExperimentRun,
} from "./handwritingExperienceReport";
import {
  HANDWRITING_EXPERIMENT_TASK_IDS,
} from "./handwritingExperienceTasks";

const TOKENS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];

function run(
  variant,
  pairToken = TOKENS[0],
  offset = 0,
  exportedAt = variant === "legacy"
    ? "2026-08-16T20:00:00.000Z"
    : "2026-08-16T20:00:01.000Z"
) {
  const policy = variant === "legacy"
    ? { recognizer: "gemini", quietPeriodMs: 1500, maxRecognitionConcurrency: 1 }
    : { recognizer: "gemini", quietPeriodMs: 750, maxRecognitionConcurrency: 2 };
  return {
    schemaVersion: 3,
    experiment: "gemini-scheduling-ab-v1",
    variant,
    pairToken,
    exportedAt,
    consent: {
      voluntaryParticipation: true,
      syntheticPromptsOnly: true,
      contentFreeExportAcknowledged: true,
    },
    policy,
    environment: { browserClass: "chromium", deviceClass: "touch-large" },
    assessments: HANDWRITING_EXPERIMENT_TASK_IDS.map((taskId) => ({
      taskId,
      responsiveness: 4,
      confidence: 5,
      accuracy: "correct",
      corrections: 1,
      flickerOrIncomplete: 0,
    })),
    metrics: HANDWRITING_EXPERIMENT_TASK_IDS.flatMap((taskId) => [
      {
        taskId,
        provider: "gemini",
        outcome: "committed",
        stages: {
          pointer_up: 0,
          expression_ready: 750 + offset,
          recognition_finished: 900 + offset,
          judge_end: 940 + offset,
          result_painted: 960 + offset,
        },
      },
      {
        taskId,
        provider: "gemini",
        outcome: "success",
        stages: {
          request_start: 20,
          transcription_received: Math.max(20, 120 + offset),
        },
      },
    ]),
  };
}

function pairedRuns(token, index) {
  const legacyFirst = index % 2 === 0;
  return [
    run(
      "legacy",
      token,
      0,
      legacyFirst
        ? "2026-08-16T20:00:00.000Z"
        : "2026-08-16T20:00:01.000Z"
    ),
    run(
      "current",
      token,
      -300,
      legacyFirst
        ? "2026-08-16T20:00:01.000Z"
        : "2026-08-16T20:00:00.000Z"
    ),
  ];
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
      run("current", TOKENS[0], -300),
    ]);
    expect(report.totalRuns).toBe(2);
    expect(report.readiness).toMatchObject({
      ready: false,
      completePairs: 1,
      issues: ["too_few_complete_pairs"],
    });
    expect(report.variants.legacy.latency.pointerUpToPaintMs)
      .toEqual({ n: 12, p50: 960, p95: 960 });
    expect(report.variants.current.latency.providerRequestMs.p50).toBe(0);
    expect(report.variants.current.protocol).toMatchObject({
      completeRuns: 1,
      expectedTasks: 12,
      committedPaintedResults: 12,
      providerRequests: 12,
      staleResultCount: 0,
    });
    expect(report.variants.current.experience).toMatchObject({
      exactRecognitionRate: 1,
      correctionCount: 12,
      meanResponsiveness: 4,
    });
  });

  it("marks exactly three complete anonymous pairs as evidence-ready", () => {
    const report = aggregateHandwritingExperimentRuns(
      TOKENS.flatMap(pairedRuns)
    );

    expect(report.readiness).toEqual({
      ready: true,
      requiredPairs: { min: 3, max: 5 },
      completePairs: 3,
      unpairedRuns: 0,
      environmentMismatchPairs: 0,
      incompleteRuns: 0,
      requiredEnvironments: [],
      coveredEnvironments: ["chromium/touch-large"],
      missingRequiredEnvironments: [],
      firstVariantCounts: { legacy: 2, current: 1, tie: 0 },
      issues: [],
    });
    expect(JSON.stringify(report)).not.toContain(TOKENS[0]);
    expect(report.breakdowns.environment["chromium/touch-large"])
      .toMatchObject({
        legacy: { runs: 3 },
        current: { runs: 3 },
      });
  });

  it("runs the documented Node CLI and enforces the readiness gate", () => {
    const directory = mkdtempSync(join(tmpdir(), "verity-hwr-ab-"));
    try {
      const paths = TOKENS.flatMap((token, pairIndex) =>
        pairedRuns(token, pairIndex).map((value) => {
          const variant = value.variant;
          const path = join(directory, `${pairIndex}-${variant}.json`);
          writeFileSync(path, JSON.stringify(value), "utf8");
          return path;
        })
      );
      const script = join(
        process.cwd(),
        "scripts",
        "aggregate-handwriting-experiment.mjs"
      );
      const report = JSON.parse(execFileSync(
        process.execPath,
        [
          script,
          "--require-ready",
          "--require-environment",
          "chromium/touch-large",
          ...paths,
        ],
        { encoding: "utf8" }
      ));
      expect(report.readiness.ready).toBe(true);
      expect(JSON.stringify(report)).not.toContain(TOKENS[0]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires complete-pair coverage for each declared target environment", () => {
    const report = aggregateHandwritingExperimentRuns(
      TOKENS.flatMap(pairedRuns),
      { requiredEnvironments: ["safari/touch-medium"] }
    );
    expect(report.readiness).toMatchObject({
      ready: false,
      requiredEnvironments: ["safari/touch-medium"],
      coveredEnvironments: ["chromium/touch-large"],
      missingRequiredEnvironments: ["safari/touch-medium"],
      issues: ["missing_required_environment"],
    });
  });

  it("does not echo malformed input content from the CLI", () => {
    const directory = mkdtempSync(join(tmpdir(), "verity-hwr-ab-bad-"));
    try {
      const path = join(directory, "malformed.json");
      writeFileSync(path, "private-recognized-answer", "utf8");
      const script = join(
        process.cwd(),
        "scripts",
        "aggregate-handwriting-experiment.mjs"
      );
      const result = spawnSync(process.execPath, [script, path], {
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("could not be read or parsed");
      expect(result.stderr).not.toContain("private-recognized-answer");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports unpaired, environment-mismatched, and incomplete runs", () => {
    const mismatched = run("current", TOKENS[1]);
    mismatched.environment.deviceClass = "pointer-large";
    const incomplete = run("legacy", TOKENS[2]);
    incomplete.metrics = incomplete.metrics.slice(2);
    const report = aggregateHandwritingExperimentRuns([
      run("legacy", TOKENS[0]),
      run("legacy", TOKENS[1]),
      mismatched,
      incomplete,
      run("current", TOKENS[2]),
    ]);

    expect(report.readiness.ready).toBe(false);
    expect(report.readiness).toMatchObject({
      unpairedRuns: 1,
      environmentMismatchPairs: 1,
      incompleteRuns: 1,
    });
    expect(report.readiness.issues).toEqual(expect.arrayContaining([
      "too_few_complete_pairs",
      "unpaired_runs",
      "paired_environment_mismatch",
      "incomplete_run_metrics",
    ]));
  });

  it("rejects policy drift, incomplete tasks, and non-allowlisted content", () => {
    const wrongPolicy = run("current");
    wrongPolicy.policy.quietPeriodMs = 1500;
    expect(() => validateHandwritingExperimentRun(wrongPolicy))
      .toThrow(/variant policy is invalid/);

    const missingTask = run("current");
    missingTask.assessments.pop();
    expect(() => validateHandwritingExperimentRun(missingTask))
      .toThrow(/collection is incomplete/);

    const unsafe = run("current");
    unsafe.metrics[0].recognizedText = "private answer";
    expect(() => validateHandwritingExperimentRun(unsafe))
      .toThrow(/non-allowlisted field/);
  });

  it("rejects absent, incomplete, or identifying consent records", () => {
    const absent = run("current");
    delete absent.consent;
    expect(() => validateHandwritingExperimentRun(absent))
      .toThrow(/consent.*plain object/);

    const declined = run("current");
    declined.consent.voluntaryParticipation = false;
    expect(() => validateHandwritingExperimentRun(declined))
      .toThrow(/consent attestation is incomplete/);

    const identifying = run("current");
    identifying.consent.email = "participant@example.invalid";
    expect(() => validateHandwritingExperimentRun(identifying))
      .toThrow(/non-allowlisted field/);
  });

  it("sanitizes untrusted browser events again before export", () => {
    const metric = sanitizeHandwritingExperimentMetric({
      provider: "gemini",
      pageId: "private-page",
      text: "private answer",
      strokes: [{ points: [{ x: 1, y: 2 }] }],
      totalMs: 12,
      stages: { recognition_start: 2, private_stage: 3 },
    }, "linear-01");
    expect(metric).toEqual({
      taskId: "linear-01",
      provider: "gemini",
      totalMs: 12,
      stages: { recognition_start: 2 },
    });
    expect(JSON.stringify(metric)).not.toContain("private");
  });
});
