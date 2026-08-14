const ALLOWED_META = new Set([
  "provider",
  "mode",
  "expressionVersion",
  "fallbackUsed",
  "fallbackReason",
  "outcome",
]);

export const RECOGNITION_STAGES = Object.freeze([
  "recognition_queued",
  "png_encode_start",
  "png_encode_end",
  "request_start",
  "transcription_received",
  "normalization_finished",
]);

export const RECOGNITION_LIFECYCLE_STAGES = Object.freeze([
  "pointer_up",
  "expression_ready",
  "recognition_queued",
  "recognition_start",
  "recognition_finished",
  "judge_start",
  "judge_end",
  "result_painted",
]);

export const RECOGNITION_METRIC_EVENT = "verity:recognition-metric";

function safeMeta(meta) {
  return Object.fromEntries(
    Object.entries(meta ?? {}).filter(([key, value]) =>
      ALLOWED_META.has(key) && ["string", "number", "boolean"].includes(typeof value)
    )
  );
}

export function createRecognitionTrace(
  meta,
  { now = () => performance.now(), emit = null } = {}
) {
  const startedAt = now();
  const marks = {};

  return {
    mark(stage) {
      if (!RECOGNITION_STAGES.includes(stage)) {
        throw new TypeError(`Unknown recognition metric stage: ${stage}`);
      }
      marks[stage] = Math.max(0, now() - startedAt);
    },
    finish(extra = {}) {
      const record = {
        ...safeMeta(meta),
        ...safeMeta(extra),
        totalMs: Math.max(0, now() - startedAt),
        stages: { ...marks },
      };
      emit?.(record);
      return record;
    },
  };
}

export function emitRecognitionMetric(record) {
  if (
    typeof globalThis.dispatchEvent !== "function" ||
    typeof globalThis.CustomEvent !== "function"
  ) {
    return;
  }
  const allowedStages = new Set([
    ...RECOGNITION_STAGES,
    ...RECOGNITION_LIFECYCLE_STAGES,
  ]);
  const stages = Object.fromEntries(
    Object.entries(record?.stages ?? {}).filter(([stage, value]) =>
      allowedStages.has(stage) && Number.isFinite(value)
    )
  );
  const detail = {
    ...safeMeta(record),
    totalMs: Number.isFinite(record?.totalMs) ? record.totalMs : 0,
    stages,
  };
  globalThis.dispatchEvent(new CustomEvent(RECOGNITION_METRIC_EVENT, {
    detail,
  }));
}

export function createRecognitionLifecycleTrace(
  meta,
  {
    now = () => performance.now(),
    startedAt = now(),
    emit = emitRecognitionMetric,
  } = {}
) {
  const marks = {};
  let finished = null;

  const markAt = (stage, timestamp) => {
    if (!RECOGNITION_LIFECYCLE_STAGES.includes(stage)) {
      throw new TypeError(`Unknown recognition lifecycle stage: ${stage}`);
    }
    if (!Number.isFinite(timestamp)) return;
    marks[stage] = Math.max(0, timestamp - startedAt);
  };

  return {
    mark(stage) {
      markAt(stage, now());
    },
    markAt,
    finish(extra = {}) {
      if (finished) return finished;
      finished = {
        ...safeMeta(meta),
        ...safeMeta(extra),
        totalMs: Math.max(0, now() - startedAt),
        stages: { ...marks },
      };
      emit?.(finished);
      return finished;
    },
  };
}
