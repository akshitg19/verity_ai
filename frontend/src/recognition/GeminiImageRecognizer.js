import { transcribeLine } from "../api";
import { renderLineToPng } from "../canvas/render";
import RecognizerAdapter from "./RecognizerAdapter";
import {
  createRecognitionTrace,
  emitRecognitionMetric,
} from "./recognitionMetrics";
import {
  normalizeRecognitionResult,
  RecognitionError,
  throwIfAborted,
} from "./recognitionTypes";

function pngPayload(dataUrl) {
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);
  if (!dataUrl.startsWith("data:image/png") || markerIndex === -1) {
    throw new RecognitionError("The handwriting renderer did not return PNG data.", {
      code: "invalid_png_data_url",
      source: "gemini",
    });
  }
  return dataUrl.slice(markerIndex + marker.length);
}

export default class GeminiImageRecognizer extends RecognizerAdapter {
  constructor({
    render = renderLineToPng,
    transcribe = transcribeLine,
    now,
    emitMetric = emitRecognitionMetric,
  } = {}) {
    super("gemini", { inputMode: "image", supportsProvisional: false });
    this.render = render;
    this.transcribe = transcribe;
    this.now = now;
    this.emitMetric = emitMetric;
  }

  async recognize({ strokes, expressionVersion, signal } = {}) {
    throwIfAborted(signal);
    if (!Array.isArray(strokes) || strokes.length === 0) {
      throw new RecognitionError("There is no handwriting to recognize.", {
        code: "empty_ink",
        source: this.source,
      });
    }

    const trace = createRecognitionTrace(
      {
        provider: this.source,
        mode: "image",
        expressionVersion: expressionVersion ?? 0,
      },
      { now: this.now, emit: this.emitMetric }
    );
    trace.mark("recognition_queued");
    trace.mark("png_encode_start");
    const dataUrl = await this.render([...strokes]);
    trace.mark("png_encode_end");
    throwIfAborted(signal);

    trace.mark("request_start");
    const result = await this.transcribe(pngPayload(dataUrl), { signal });
    trace.mark("transcription_received");
    throwIfAborted(signal);
    trace.mark("normalization_finished");
    const timings = trace.finish();

    return normalizeRecognitionResult(
      {
        text: result?.text,
        unreadable: result?.unreadable,
        format: "ascii",
        latencyMs: timings.totalMs,
        timings,
      },
      { source: this.source }
    );
  }
}

export { pngPayload };
