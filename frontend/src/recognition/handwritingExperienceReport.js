import {
  HANDWRITING_EXPERIMENT_NAME,
  HANDWRITING_EXPERIMENT_PAIR_TOKEN_PATTERN,
  HANDWRITING_EXPERIMENT_VARIANTS,
} from "./handwritingExperienceExperiment.js";
import {
  HANDWRITING_EXPERIMENT_TASK_IDS,
} from "./handwritingExperienceTasks.js";
import {
  RECOGNITION_LIFECYCLE_STAGES,
  RECOGNITION_STAGES,
} from "./recognitionMetrics.js";

export const HANDWRITING_EXPERIMENT_EXPORT_SCHEMA = 2;

const REQUIRED_PAIR_COUNT = Object.freeze({ min: 3, max: 5 });
const TASK_ID_SET = new Set(HANDWRITING_EXPERIMENT_TASK_IDS);
const BROWSER_CLASSES = new Set(["firefox", "edge", "chromium", "safari", "other"]);
const DEVICE_CLASS_PATTERN = /^(touch|pointer)-(small|medium|large)$/;
const ACCURACY_VALUES = new Set(["correct", "incorrect", "unreadable"]);
const RUN_KEYS = new Set([
  "schemaVersion", "experiment", "variant", "pairToken", "exportedAt",
  "policy", "environment", "assessments", "metrics",
]);
const POLICY_KEYS = new Set([
  "recognizer", "quietPeriodMs", "maxRecognitionConcurrency",
]);
const ENVIRONMENT_KEYS = new Set(["browserClass", "deviceClass"]);
const ASSESSMENT_KEYS = new Set([
  "taskId", "responsiveness", "confidence", "accuracy", "corrections",
  "flickerOrIncomplete",
]);
const SAFE_METRIC_META = Object.freeze([
  "provider", "mode", "expressionVersion", "fallbackUsed",
  "fallbackReason", "outcome",
]);
const METRIC_KEYS = new Set([
  "taskId", ...SAFE_METRIC_META, "totalMs", "stages",
]);
const SAFE_METRIC_STAGES = new Set([
  ...RECOGNITION_STAGES,
  ...RECOGNITION_LIFECYCLE_STAGES,
]);
const LATENCY_FIELDS = Object.freeze({
  pointerUpToReadyMs: ["pointer_up", "expression_ready"],
  pointerUpToRecognitionFinishedMs: ["pointer_up", "recognition_finished"],
  recognitionToVerdictMs: ["recognition_finished", "judge_end"],
  pointerUpToPaintMs: ["pointer_up", "result_painted"],
});

function invalidRun(message) {
  throw new TypeError(`Invalid handwriting experiment export: ${message}.`);
}

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalidRun(`${label} must be a plain object`);
  }
  return value;
}

function exactKeys(value, allowed, label) {
  plainRecord(value, label);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    invalidRun(`${label} contains a non-allowlisted field`);
  }
}

function boundedInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function boundedNumber(value, minimum = 0, maximum = 600_000) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validateAssessment(entry, expectedTaskId) {
  exactKeys(entry, ASSESSMENT_KEYS, "assessment");
  if (
    entry.taskId !== expectedTaskId ||
    !boundedInteger(entry.responsiveness, 1, 5) ||
    !boundedInteger(entry.confidence, 1, 5) ||
    !ACCURACY_VALUES.has(entry.accuracy) ||
    !boundedInteger(entry.corrections, 0, 100) ||
    !boundedInteger(entry.flickerOrIncomplete, 0, 100)
  ) {
    invalidRun("assessment value or task order is invalid");
  }
}

function validateMetric(metric) {
  exactKeys(metric, METRIC_KEYS, "metric");
  if (!TASK_ID_SET.has(metric.taskId)) invalidRun("metric task is invalid");
  if ("totalMs" in metric && !boundedNumber(metric.totalMs)) {
    invalidRun("metric total is invalid");
  }
  for (const key of SAFE_METRIC_META) {
    if (!(key in metric)) continue;
    const value = metric[key];
    if (!["string", "number", "boolean"].includes(typeof value)) {
      invalidRun("metric metadata is invalid");
    }
    if (typeof value === "string" && (value.length === 0 || value.length > 120)) {
      invalidRun("metric metadata is invalid");
    }
    if (typeof value === "number" && !boundedNumber(value)) {
      invalidRun("metric metadata is invalid");
    }
  }
  exactKeys(metric.stages, SAFE_METRIC_STAGES, "metric stages");
  if (Object.values(metric.stages).some((value) => !boundedNumber(value))) {
    invalidRun("metric stage is invalid");
  }
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

export function percentile(values, proportion) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = Math.min(1, Math.max(0, proportion)) * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

function summarize(values) {
  const safe = values.filter(Number.isFinite);
  return {
    n: safe.length,
    p50: finite(percentile(safe, 0.5)),
    p95: finite(percentile(safe, 0.95)),
  };
}

function interval(stages, [start, end]) {
  const startValue = stages?.[start];
  const endValue = stages?.[end];
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return null;
  return Math.max(0, endValue - startValue);
}

function average(values) {
  const safe = values.filter(Number.isFinite);
  return safe.length
    ? safe.reduce((total, value) => total + value, 0) / safe.length
    : null;
}

export function sanitizeHandwritingExperimentMetric(detail, taskId) {
  const metric = { taskId };
  for (const key of SAFE_METRIC_META) {
    const value = detail?.[key];
    if (["string", "number", "boolean"].includes(typeof value)) {
      metric[key] = value;
    }
  }
  if (Number.isFinite(detail?.totalMs)) metric.totalMs = detail.totalMs;
  metric.stages = Object.fromEntries(
    Object.entries(detail?.stages ?? {}).filter(([stage, value]) =>
      SAFE_METRIC_STAGES.has(stage) && Number.isFinite(value)
    )
  );
  return metric;
}

export function validateHandwritingExperimentRun(run) {
  exactKeys(run, RUN_KEYS, "run");
  if (run.schemaVersion !== HANDWRITING_EXPERIMENT_EXPORT_SCHEMA) {
    invalidRun("schema version is unsupported");
  }
  const expectedPolicy = HANDWRITING_EXPERIMENT_VARIANTS[run.variant];
  if (
    run.experiment !== HANDWRITING_EXPERIMENT_NAME ||
    !expectedPolicy ||
    !HANDWRITING_EXPERIMENT_PAIR_TOKEN_PATTERN.test(run.pairToken) ||
    !validTimestamp(run.exportedAt)
  ) {
    invalidRun("identity, pairing token, or timestamp is invalid");
  }

  exactKeys(run.policy, POLICY_KEYS, "policy");
  if (
    run.policy.recognizer !== "gemini" ||
    run.policy.quietPeriodMs !== expectedPolicy.quietPeriodMs ||
    run.policy.maxRecognitionConcurrency !==
      expectedPolicy.maxRecognitionConcurrency
  ) {
    invalidRun("variant policy is invalid");
  }

  exactKeys(run.environment, ENVIRONMENT_KEYS, "environment");
  if (
    !BROWSER_CLASSES.has(run.environment.browserClass) ||
    !DEVICE_CLASS_PATTERN.test(run.environment.deviceClass)
  ) {
    invalidRun("environment class is invalid");
  }

  if (
    !Array.isArray(run.assessments) ||
    run.assessments.length !== HANDWRITING_EXPERIMENT_TASK_IDS.length ||
    !Array.isArray(run.metrics) ||
    run.metrics.length > 1_000
  ) {
    invalidRun("assessment or metric collection is incomplete");
  }
  run.assessments.forEach((entry, index) =>
    validateAssessment(entry, HANDWRITING_EXPERIMENT_TASK_IDS[index])
  );
  run.metrics.forEach(validateMetric);
  return run;
}

function runProtocol(run) {
  const committedPaintedResults = run.metrics.filter((metric) =>
    metric.outcome === "committed" &&
    Number.isFinite(metric.stages?.result_painted)
  ).length;
  const providerRequests = run.metrics.filter((metric) =>
    Number.isFinite(metric.stages?.request_start) &&
    Number.isFinite(metric.stages?.transcription_received)
  ).length;
  const staleResultCount = run.metrics.filter((metric) =>
    metric.outcome === "stale"
  ).length;
  const errorResultCount = run.metrics.filter((metric) =>
    metric.outcome === "error"
  ).length;
  const expected = HANDWRITING_EXPERIMENT_TASK_IDS.length;
  return {
    complete:
      committedPaintedResults === expected &&
      providerRequests === expected &&
      staleResultCount === 0 &&
      errorResultCount === 0,
    expectedTasks: expected,
    committedPaintedResults,
    providerRequests,
    staleResultCount,
    errorResultCount,
  };
}

function aggregateVariant(runs) {
  const assessments = runs.flatMap((run) => run.assessments);
  const metrics = runs.flatMap((run) => run.metrics);
  const protocols = runs.map(runProtocol);
  const lifecycle = metrics.filter((metric) =>
    Number.isFinite(metric?.stages?.result_painted)
  );
  const adapter = metrics.filter((metric) =>
    Number.isFinite(metric?.stages?.request_start) &&
    Number.isFinite(metric?.stages?.transcription_received)
  );
  const latency = Object.fromEntries(
    Object.entries(LATENCY_FIELDS).map(([name, range]) => [
      name,
      summarize(lifecycle.map((metric) => interval(metric.stages, range))),
    ])
  );
  latency.providerRequestMs = summarize(adapter.map((metric) => interval(
    metric.stages,
    ["request_start", "transcription_received"]
  )));

  return {
    runs: runs.length,
    completedTasks: assessments.length,
    paintedResults: lifecycle.length,
    latency,
    protocol: {
      completeRuns: protocols.filter(({ complete }) => complete).length,
      expectedTasks: protocols.reduce((total, value) => total + value.expectedTasks, 0),
      committedPaintedResults: protocols.reduce(
        (total, value) => total + value.committedPaintedResults,
        0
      ),
      providerRequests: protocols.reduce(
        (total, value) => total + value.providerRequests,
        0
      ),
      staleResultCount: protocols.reduce(
        (total, value) => total + value.staleResultCount,
        0
      ),
      errorResultCount: protocols.reduce(
        (total, value) => total + value.errorResultCount,
        0
      ),
    },
    experience: {
      meanResponsiveness: finite(average(
        assessments.map((entry) => entry.responsiveness)
      )),
      meanConfidence: finite(average(
        assessments.map((entry) => entry.confidence)
      )),
      exactRecognitionRate:
        assessments.filter((entry) => entry.accuracy === "correct").length /
        assessments.length,
      unreadableRate:
        assessments.filter((entry) => entry.accuracy === "unreadable").length /
        assessments.length,
      correctionCount: assessments.reduce(
        (total, entry) => total + entry.corrections,
        0
      ),
      flickerOrIncompleteCount: assessments.reduce(
        (total, entry) => total + entry.flickerOrIncomplete,
        0
      ),
    },
  };
}

function pairingReadiness(runs) {
  const groups = new Map();
  for (const run of runs) {
    const group = groups.get(run.pairToken) ?? [];
    group.push(run);
    groups.set(run.pairToken, group);
  }

  let completePairs = 0;
  let unpairedRuns = 0;
  let environmentMismatchPairs = 0;
  let incompleteRuns = 0;
  const firstVariantCounts = { legacy: 0, current: 0, tie: 0 };
  for (const group of groups.values()) {
    const legacy = group.filter(({ variant }) => variant === "legacy");
    const current = group.filter(({ variant }) => variant === "current");
    if (group.length !== 2 || legacy.length !== 1 || current.length !== 1) {
      unpairedRuns += group.length;
      continue;
    }
    if (
      legacy[0].environment.browserClass !== current[0].environment.browserClass ||
      legacy[0].environment.deviceClass !== current[0].environment.deviceClass
    ) {
      environmentMismatchPairs += 1;
      continue;
    }
    const legacyProtocol = runProtocol(legacy[0]);
    const currentProtocol = runProtocol(current[0]);
    if (!legacyProtocol.complete || !currentProtocol.complete) {
      incompleteRuns += Number(!legacyProtocol.complete);
      incompleteRuns += Number(!currentProtocol.complete);
      continue;
    }
    const legacyTime = new Date(legacy[0].exportedAt).getTime();
    const currentTime = new Date(current[0].exportedAt).getTime();
    if (legacyTime < currentTime) firstVariantCounts.legacy += 1;
    else if (currentTime < legacyTime) firstVariantCounts.current += 1;
    else firstVariantCounts.tie += 1;
    completePairs += 1;
  }

  const issues = [];
  if (completePairs < REQUIRED_PAIR_COUNT.min) issues.push("too_few_complete_pairs");
  if (completePairs > REQUIRED_PAIR_COUNT.max) issues.push("too_many_complete_pairs");
  if (unpairedRuns) issues.push("unpaired_runs");
  if (environmentMismatchPairs) issues.push("paired_environment_mismatch");
  if (incompleteRuns) issues.push("incomplete_run_metrics");
  if (firstVariantCounts.tie) issues.push("paired_order_ambiguous");
  if (Math.abs(firstVariantCounts.legacy - firstVariantCounts.current) > 1) {
    issues.push("paired_order_imbalanced");
  }
  return {
    ready: issues.length === 0,
    requiredPairs: REQUIRED_PAIR_COUNT,
    completePairs,
    unpairedRuns,
    environmentMismatchPairs,
    incompleteRuns,
    firstVariantCounts,
    issues,
  };
}

function aggregateEnvironmentBreakdowns(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.environment.browserClass}/${run.environment.deviceClass}`;
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }
  return Object.fromEntries([...groups].sort(([left], [right]) =>
    left.localeCompare(right)
  ).map(([key, group]) => [
    key,
    Object.fromEntries(["legacy", "current"].flatMap((variant) => {
      const matching = group.filter((run) => run.variant === variant);
      return matching.length ? [[variant, aggregateVariant(matching)]] : [];
    })),
  ]));
}

export function aggregateHandwritingExperimentRuns(rawRuns) {
  const runs = rawRuns.map(validateHandwritingExperimentRun);
  const variants = {};
  for (const variant of ["legacy", "current"]) {
    const matching = runs.filter((run) => run.variant === variant);
    if (matching.length) variants[variant] = aggregateVariant(matching);
  }
  return {
    schemaVersion: 2,
    experiment: runs[0]?.experiment ?? null,
    generatedAt: new Date().toISOString(),
    totalRuns: runs.length,
    readiness: pairingReadiness(runs),
    variants,
    breakdowns: {
      environment: aggregateEnvironmentBreakdowns(runs),
    },
    caveat: "Internal qualitative scheduling comparison; not provider-selection evidence.",
  };
}
