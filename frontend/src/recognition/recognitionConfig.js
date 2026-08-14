import GeminiImageRecognizer from "./GeminiImageRecognizer";
import HybridRecognizer from "./HybridRecognizer";
import ShadowRecognizer from "./ShadowRecognizer";

export const HANDWRITING_MODES = Object.freeze({
  GEMINI: "gemini",
  SHADOW: "shadow",
  HYBRID: "hybrid",
});

export const VECTOR_QUIET_PERIOD_MS = 350;
export const IMAGE_QUIET_PERIOD_MS = 750;
export const DEFAULT_RECOGNITION_TIMEOUT_MS = 3_000;

export function resolveHandwritingMode(value) {
  return Object.values(HANDWRITING_MODES).includes(value)
    ? value
    : HANDWRITING_MODES.GEMINI;
}

export function createConfiguredRecognizer({
  mode = resolveHandwritingMode(import.meta.env.VITE_HANDWRITING_MODE),
  gemini = new GeminiImageRecognizer(),
  primary = null,
  onShadowResult = null,
  primaryTimeoutMs = DEFAULT_RECOGNITION_TIMEOUT_MS,
} = {}) {
  if (!primary || mode === HANDWRITING_MODES.GEMINI) return gemini;
  if (mode === HANDWRITING_MODES.SHADOW) {
    return new ShadowRecognizer({
      control: gemini,
      candidate: primary,
      onCandidateResult: onShadowResult,
    });
  }
  return new HybridRecognizer({
    primary,
    fallback: gemini,
    primaryTimeoutMs,
  });
}

export const defaultMathRecognizer = createConfiguredRecognizer();

