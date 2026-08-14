export const HANDWRITING_EXPERIMENT_EXPORT_SCHEMA = 1;

const LATENCY_FIELDS = Object.freeze({
  pointerUpToReadyMs: ["pointer_up", "expression_ready"],
  pointerUpToRecognitionFinishedMs: ["pointer_up", "recognition_finished"],
  recognitionToVerdictMs: ["recognition_finished", "judge_end"],
  pointerUpToPaintMs: ["pointer_up", "result_painted"],
});

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

export function validateHandwritingExperimentRun(run) {
  if (run?.schemaVersion !== HANDWRITING_EXPERIMENT_EXPORT_SCHEMA) {
    throw new TypeError("Unsupported handwriting experiment export schema.");
  }
  if (!run.experiment || !["legacy", "current"].includes(run.variant)) {
    throw new TypeError("Handwriting experiment name and variant are required.");
  }
  if (!Array.isArray(run.assessments) || !Array.isArray(run.metrics)) {
    throw new TypeError("Handwriting experiment assessments and metrics are required.");
  }
  return run;
}

function aggregateVariant(runs) {
  const assessments = runs.flatMap((run) => run.assessments);
  const metrics = runs.flatMap((run) => run.metrics);
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

  const ratedAccuracy = assessments.filter((entry) =>
    ["correct", "incorrect", "unreadable"].includes(entry.accuracy)
  );
  return {
    runs: runs.length,
    completedTasks: assessments.length,
    paintedResults: lifecycle.length,
    latency,
    experience: {
      meanResponsiveness: finite(average(
        assessments.map((entry) => entry.responsiveness)
      )),
      meanConfidence: finite(average(
        assessments.map((entry) => entry.confidence)
      )),
      exactRecognitionRate: ratedAccuracy.length
        ? ratedAccuracy.filter((entry) => entry.accuracy === "correct").length /
          ratedAccuracy.length
        : null,
      unreadableRate: ratedAccuracy.length
        ? ratedAccuracy.filter((entry) => entry.accuracy === "unreadable").length /
          ratedAccuracy.length
        : null,
      correctionCount: assessments.reduce(
        (total, entry) => total + (Number(entry.corrections) || 0),
        0
      ),
      flickerOrIncompleteCount: assessments.reduce(
        (total, entry) => total + (Number(entry.flickerOrIncomplete) || 0),
        0
      ),
    },
  };
}

export function aggregateHandwritingExperimentRuns(rawRuns) {
  const runs = rawRuns.map(validateHandwritingExperimentRun);
  const variants = {};
  for (const variant of ["legacy", "current"]) {
    const matching = runs.filter((run) => run.variant === variant);
    if (matching.length) variants[variant] = aggregateVariant(matching);
  }
  return {
    schemaVersion: 1,
    experiment: runs[0]?.experiment ?? null,
    generatedAt: new Date().toISOString(),
    totalRuns: runs.length,
    variants,
    caveat: "Internal qualitative scheduling comparison; not provider-selection evidence.",
  };
}
