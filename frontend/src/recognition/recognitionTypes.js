export const RECOGNITION_FORMATS = Object.freeze([
  "ascii",
  "latex",
  "jiix",
]);

export const FALLBACK_REASONS = Object.freeze({
  EMPTY: "empty",
  TIMEOUT: "timeout",
  SERVICE_ERROR: "service_error",
  UNREADABLE: "unreadable",
  UNPARSEABLE: "unparseable",
  UNSUPPORTED_FORMAT: "unsupported_format",
});

export class RecognitionError extends Error {
  constructor(message, { code = "recognition_error", source = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RecognitionError";
    this.code = code;
    this.source = source;
  }
}

export function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

export function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("Recognition was cancelled.", "AbortError");
}

function normalizeCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((candidate) => {
      if (typeof candidate === "string") return { text: candidate };
      if (!candidate || typeof candidate.text !== "string") return null;
      const normalized = { text: candidate.text };
      if (Number.isFinite(candidate.confidence)) {
        normalized.confidence = candidate.confidence;
      }
      return normalized;
    })
    .filter(Boolean);
}

export function normalizeRecognitionResult(result, { source = "unknown" } = {}) {
  const unreadable = Boolean(result?.unreadable);
  const text = unreadable ? "" : String(result?.text ?? "").trim();
  const formatSupported = result?.format === undefined ||
    RECOGNITION_FORMATS.includes(result.format);
  const format = formatSupported && result?.format
    ? result.format
    : "ascii";
  const candidates = normalizeCandidates(result?.candidates);
  if (text && !candidates.some((candidate) => candidate.text === text)) {
    candidates.unshift({ text });
  }

  return {
    text,
    format,
    candidates,
    source: result?.source ?? source,
    provisional: Boolean(result?.provisional),
    unreadable,
    formatSupported,
    parseable:
      typeof result?.parseable === "boolean"
        ? result.parseable
        : Boolean(text) && !unreadable && formatSupported,
    fallbackUsed: Boolean(result?.fallbackUsed),
    fallbackReason: result?.fallbackReason ?? null,
    latencyMs: Number.isFinite(result?.latencyMs) ? result.latencyMs : 0,
    timings: result?.timings && typeof result.timings === "object"
      ? { ...result.timings }
      : {},
  };
}
