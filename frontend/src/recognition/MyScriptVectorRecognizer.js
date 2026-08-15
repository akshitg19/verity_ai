import { recognizeMyScript } from "../api";
import RecognizerAdapter from "./RecognizerAdapter";
import {
  createRecognitionTrace,
  emitRecognitionMetric,
} from "./recognitionMetrics";
import {
  FALLBACK_REASONS,
  isAbortError,
  normalizeRecognitionResult,
  RecognitionError,
  throwIfAborted,
} from "./recognitionTypes";

export const MYSCRIPT_PROFILE = "linear-equation-v1";
export const MYSCRIPT_ELIGIBLE_TOPIC = "algebra";
export const CSS_PIXELS_PER_INCH = 96;

const POINTER_TYPES = new Set(["pen", "touch", "mouse", "synthetic"]);

function invalidInk(message) {
  return new RecognitionError(message, {
    code: "invalid_vector_ink",
    source: "myscript",
  });
}

function pointPayload(point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    throw invalidInk("Vector ink contains an invalid coordinate.");
  }
  const payload = { x: point.x, y: point.y };
  if (Number.isFinite(point.t)) payload.t = point.t;
  if (Number.isFinite(point.p) && point.p >= 0 && point.p <= 1) {
    payload.p = point.p;
  }
  return payload;
}

function strokePayload(stroke) {
  if (!Array.isArray(stroke?.points) || stroke.points.length === 0) {
    throw invalidInk("Vector ink contains an empty stroke.");
  }
  const payload = { points: stroke.points.map(pointPayload) };
  if (POINTER_TYPES.has(stroke.pointerType)) {
    payload.pointer_type = stroke.pointerType;
  }
  return payload;
}

function validDpi(value) {
  return Number.isFinite(value) && value >= 36 && value <= 600;
}

export function myscriptRequestPayload(
  strokes,
  { dpiX = CSS_PIXELS_PER_INCH, dpiY = CSS_PIXELS_PER_INCH } = {}
) {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    throw invalidInk("There is no vector handwriting to recognize.");
  }
  if (!validDpi(dpiX) || !validDpi(dpiY)) {
    throw new TypeError("MyScript DPI must be between 36 and 600.");
  }
  return {
    schema_version: 1,
    profile: MYSCRIPT_PROFILE,
    strokes: strokes.map(strokePayload),
    dpi_x: dpiX,
    dpi_y: dpiY,
  };
}

function providerFailure(error) {
  if (error?.status === 504 || error?.status === 408) {
    return new RecognitionError("Vector recognition timed out.", {
      code: FALLBACK_REASONS.TIMEOUT,
      source: "myscript",
    });
  }
  if (error?.status === 422) {
    return new RecognitionError("This handwriting format is not supported.", {
      code: FALLBACK_REASONS.UNSUPPORTED_FORMAT,
      source: "myscript",
    });
  }
  if (error?.status === 404) {
    return new RecognitionError("Vector recognition is disabled.", {
      code: "provider_disabled",
      source: "myscript",
    });
  }
  if (error?.status === 429) {
    return new RecognitionError("Vector recognition budget is unavailable.", {
      code: "provider_budget_unavailable",
      source: "myscript",
    });
  }
  return new RecognitionError("Vector recognition is temporarily unavailable.", {
    code: FALLBACK_REASONS.SERVICE_ERROR,
    source: "myscript",
  });
}

export default class MyScriptVectorRecognizer extends RecognizerAdapter {
  constructor({
    recognize = recognizeMyScript,
    dpiX = CSS_PIXELS_PER_INCH,
    dpiY = CSS_PIXELS_PER_INCH,
    now,
    emitMetric = emitRecognitionMetric,
  } = {}) {
    super("myscript", { inputMode: "vector", supportsProvisional: false });
    if (!validDpi(dpiX) || !validDpi(dpiY)) {
      throw new TypeError("MyScript DPI must be between 36 and 600.");
    }
    this.recognizeRequest = recognize;
    this.dpiX = dpiX;
    this.dpiY = dpiY;
    this.now = now;
    this.emitMetric = emitMetric;
  }

  async recognize({ strokes, expressionVersion, topic, signal } = {}) {
    throwIfAborted(signal);
    if (topic !== MYSCRIPT_ELIGIBLE_TOPIC) {
      throw new RecognitionError(
        "MyScript POC recognition is limited to algebra.",
        { code: "unsupported_topic", source: this.source }
      );
    }
    const payload = myscriptRequestPayload(strokes, {
      dpiX: this.dpiX,
      dpiY: this.dpiY,
    });
    const trace = createRecognitionTrace(
      {
        provider: this.source,
        mode: "vector",
        expressionVersion: expressionVersion ?? 0,
      },
      { now: this.now, emit: this.emitMetric }
    );
    trace.mark("recognition_queued");
    trace.mark("request_start");

    let result;
    try {
      result = await this.recognizeRequest(payload, { signal });
    } catch (error) {
      trace.finish({ outcome: signal?.aborted ? "cancelled" : "error" });
      if (signal?.aborted || isAbortError(error)) throw error;
      throw providerFailure(error);
    }

    throwIfAborted(signal);
    trace.mark("transcription_received");
    trace.mark("normalization_finished");
    const timings = trace.finish({ outcome: "success" });
    return normalizeRecognitionResult(
      {
        text: result?.text,
        unreadable: result?.unreadable,
        format: result?.format,
        candidates: result?.candidates,
        source: "myscript",
        provisional: false,
        latencyMs: Number.isFinite(result?.latency_ms)
          ? result.latency_ms
          : timings.totalMs,
        timings,
      },
      { source: this.source }
    );
  }
}

export { providerFailure };
