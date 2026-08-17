import GeminiImageRecognizer from "./GeminiImageRecognizer";
import HybridRecognizer from "./HybridRecognizer";
import MyScriptVectorRecognizer from "./MyScriptVectorRecognizer";
import ShadowRecognizer from "./ShadowRecognizer";
import {
  IMAGE_FINALIZATION_POLICY,
  VECTOR_FINALIZATION_POLICY,
} from "./finalizationPolicy";
export {
  IMAGE_FINALIZATION_POLICY,
  VECTOR_FINALIZATION_POLICY,
};

export const HANDWRITING_MODES = Object.freeze({
  GEMINI: "gemini",
  MYSCRIPT_POC: "myscript-poc",
  ALGEBRA_SHOWCASE: "algebra-showcase",
  SHADOW: "shadow",
  HYBRID: "hybrid",
});

export const VECTOR_QUIET_PERIOD_MS = VECTOR_FINALIZATION_POLICY.quietPeriodMs;
export const IMAGE_QUIET_PERIOD_MS = IMAGE_FINALIZATION_POLICY.quietPeriodMs;
export const DEFAULT_RECOGNITION_TIMEOUT_MS = 3_000;

export function resolveHandwritingMode(value) {
  return Object.values(HANDWRITING_MODES).includes(value)
    ? value
    : HANDWRITING_MODES.GEMINI;
}

export function resolveMyScriptPocEnabled(value) {
  return value === "true";
}

export class TopicRecognizerRouter {
  constructor({ algebra, fallback }) {
    if (!algebra || !fallback) {
      throw new TypeError("Algebra and fallback recognizers are required.");
    }
    this.source = "topic-router";
    this.algebra = algebra;
    this.fallback = fallback;
  }

  forTopic(topic) {
    return topic === "algebra" ? this.algebra : this.fallback;
  }
}

export function createConfiguredRecognizer({
  mode = resolveHandwritingMode(import.meta.env.VITE_HANDWRITING_MODE),
  gemini = new GeminiImageRecognizer(),
  primary = null,
  myscriptPocEnabled = resolveMyScriptPocEnabled(
    import.meta.env.VITE_MYSCRIPT_POC_ENABLED
  ),
  createMyScript = () => new MyScriptVectorRecognizer(),
  onShadowResult = null,
  primaryTimeoutMs = DEFAULT_RECOGNITION_TIMEOUT_MS,
} = {}) {
  // The direct POC has two independent frontend gates and deliberately has no
  // automatic image fallback. This keeps vector-only measurements honest and
  // makes a single mistaken Vercel variable fall back to the shipped Gemini
  // configuration instead of opening the backend route.
  if (mode === HANDWRITING_MODES.MYSCRIPT_POC) {
    if (!myscriptPocEnabled) return gemini;
    return primary ?? createMyScript();
  }
  if (mode === HANDWRITING_MODES.ALGEBRA_SHOWCASE) {
    if (!myscriptPocEnabled) return gemini;
    return new TopicRecognizerRouter({
      algebra: primary ?? createMyScript(),
      fallback: gemini,
    });
  }
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
