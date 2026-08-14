import { IMAGE_FINALIZATION_POLICY } from "./finalizationPolicy";

export const HANDWRITING_EXPERIMENT_QUERY = "hwr_ab";
export const HANDWRITING_EXPERIMENT_NAME = "gemini-scheduling-ab-v1";

const PRODUCTION_FRONTEND_HOST = "verity-ai-lovat.vercel.app";
const PREVIEW_HOST_PATTERN = /^verity-ai[a-z0-9-]*\.vercel\.app$/;

const VARIANTS = Object.freeze({
  legacy: Object.freeze({
    variant: "legacy",
    quietPeriodMs: 1_500,
    maxRecognitionConcurrency: 1,
  }),
  current: Object.freeze({
    variant: "current",
    quietPeriodMs: IMAGE_FINALIZATION_POLICY.quietPeriodMs,
    maxRecognitionConcurrency: 2,
  }),
});

function isInternalHost(hostname) {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    (hostname !== PRODUCTION_FRONTEND_HOST && PREVIEW_HOST_PATTERN.test(hostname));
}

export function resolveHandwritingExperienceExperiment(
  location = globalThis.location
) {
  const disabled = {
    enabled: false,
    name: HANDWRITING_EXPERIMENT_NAME,
    variant: null,
    quietPeriodMs: IMAGE_FINALIZATION_POLICY.quietPeriodMs,
    maxRecognitionConcurrency: 2,
  };
  if (!location || !isInternalHost(location.hostname)) return disabled;

  const variant = new URLSearchParams(location.search ?? "")
    .get(HANDWRITING_EXPERIMENT_QUERY);
  if (!VARIANTS[variant]) return disabled;
  return {
    enabled: true,
    name: HANDWRITING_EXPERIMENT_NAME,
    ...VARIANTS[variant],
  };
}

export { isInternalHost };
