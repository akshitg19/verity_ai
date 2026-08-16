import { IMAGE_FINALIZATION_POLICY } from "./finalizationPolicy.js";

export const HANDWRITING_EXPERIMENT_QUERY = "hwr_ab";
export const HANDWRITING_EXPERIMENT_NAME = "gemini-scheduling-ab-v1";

const PRODUCTION_FRONTEND_HOST = "verity-ai-lovat.vercel.app";
const PREVIEW_HOST_PATTERN = /^verity-ai[a-z0-9-]*\.vercel\.app$/;

export const HANDWRITING_EXPERIMENT_VARIANTS = Object.freeze({
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

export const HANDWRITING_EXPERIMENT_PAIR_TOKEN_KEY =
  `verity:${HANDWRITING_EXPERIMENT_NAME}:pair-token`;
export const HANDWRITING_EXPERIMENT_PAIR_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function createPairToken(crypto = globalThis.crypto) {
  const token = crypto?.randomUUID?.().toLowerCase();
  if (!HANDWRITING_EXPERIMENT_PAIR_TOKEN_PATTERN.test(token ?? "")) {
    throw new TypeError("A secure experiment pairing token is unavailable.");
  }
  return token;
}

export function getOrCreateHandwritingExperimentPairToken({
  storage = globalThis.sessionStorage,
  crypto = globalThis.crypto,
} = {}) {
  if (!storage) {
    throw new TypeError("Session storage is required for experiment pairing.");
  }
  let existing;
  try {
    existing = storage.getItem(HANDWRITING_EXPERIMENT_PAIR_TOKEN_KEY);
  } catch {
    throw new TypeError(
      "Session storage is required for experiment pairing."
    );
  }
  if (HANDWRITING_EXPERIMENT_PAIR_TOKEN_PATTERN.test(existing ?? "")) {
    return existing;
  }

  const token = createPairToken(crypto);
  try {
    storage.setItem(HANDWRITING_EXPERIMENT_PAIR_TOKEN_KEY, token);
    if (storage.getItem(HANDWRITING_EXPERIMENT_PAIR_TOKEN_KEY) !== token) {
      throw new TypeError("pair token was not retained");
    }
  } catch {
    throw new TypeError(
      "Session storage is required for experiment pairing."
    );
  }
  return token;
}

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
  if (!HANDWRITING_EXPERIMENT_VARIANTS[variant]) return disabled;
  return {
    enabled: true,
    name: HANDWRITING_EXPERIMENT_NAME,
    ...HANDWRITING_EXPERIMENT_VARIANTS[variant],
  };
}

export { isInternalHost };
