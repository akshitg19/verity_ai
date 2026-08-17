import RecognizerAdapter, { assertRecognizer } from "./RecognizerAdapter";
import {
  FALLBACK_REASONS,
  isAbortError,
  normalizeRecognitionResult,
  RecognitionError,
  throwIfAborted,
} from "./recognitionTypes";

function fallbackReason(result) {
  if (result.unreadable) return FALLBACK_REASONS.UNREADABLE;
  if (!result.text) return FALLBACK_REASONS.EMPTY;
  if (!result.formatSupported) return FALLBACK_REASONS.UNSUPPORTED_FORMAT;
  if (!result.parseable) return FALLBACK_REASONS.UNPARSEABLE;
  return null;
}

async function recognizeWithTimeout(recognizer, request, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return recognizer.recognize(request);
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(request.signal?.reason);
  if (request.signal?.aborted) abortFromCaller();
  else request.signal?.addEventListener("abort", abortFromCaller, { once: true });

  let timedOut = false;
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort("timeout");
      reject(new RecognitionError("The primary recognizer timed out.", {
        code: FALLBACK_REASONS.TIMEOUT,
        source: recognizer.source ?? null,
      }));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      recognizer.recognize({ ...request, signal: controller.signal }),
      timeoutPromise,
    ]);
  } catch (error) {
    if (timedOut) {
      throw new RecognitionError("The primary recognizer timed out.", {
        code: FALLBACK_REASONS.TIMEOUT,
        source: recognizer.source ?? null,
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener?.("abort", abortFromCaller);
  }
}

export default class HybridRecognizer extends RecognizerAdapter {
  constructor({ primary, fallback, primaryTimeoutMs = 0 } = {}) {
    const checkedPrimary = assertRecognizer(primary, "primary recognizer");
    super("hybrid", {
      inputMode: checkedPrimary.inputMode ?? "image",
      supportsProvisional: Boolean(checkedPrimary.supportsProvisional),
      autoFinalize: checkedPrimary.autoFinalize !== false,
    });
    this.primary = checkedPrimary;
    this.fallback = assertRecognizer(fallback, "fallback recognizer");
    this.primaryTimeoutMs = primaryTimeoutMs;
  }

  async recognize(request = {}) {
    throwIfAborted(request.signal);
    let reason;

    try {
      const primaryResult = normalizeRecognitionResult(
        await recognizeWithTimeout(this.primary, request, this.primaryTimeoutMs),
        { source: this.primary.source ?? "primary" }
      );
      reason = fallbackReason(primaryResult);
      if (!reason) return primaryResult;
    } catch (error) {
      if (request.signal?.aborted) throwIfAborted(request.signal);
      if (isAbortError(error)) throw error;
      reason = error?.code === FALLBACK_REASONS.TIMEOUT
        ? FALLBACK_REASONS.TIMEOUT
        : FALLBACK_REASONS.SERVICE_ERROR;
    }

    throwIfAborted(request.signal);
    const result = normalizeRecognitionResult(
      await this.fallback.recognize(request),
      { source: this.fallback.source ?? "fallback" }
    );
    return {
      ...result,
      fallbackUsed: true,
      fallbackReason: reason,
    };
  }
}

export { fallbackReason, recognizeWithTimeout };
