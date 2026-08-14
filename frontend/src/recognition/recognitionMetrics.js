const ALLOWED_META = new Set([
  "provider",
  "mode",
  "expressionVersion",
  "fallbackUsed",
  "fallbackReason",
]);

export const RECOGNITION_STAGES = Object.freeze([
  "recognition_queued",
  "png_encode_start",
  "png_encode_end",
  "request_start",
  "transcription_received",
  "normalization_finished",
]);

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

