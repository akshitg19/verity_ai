// One module, one place to change a base URL.
//
// Before this there were six fetch calls scattered through App.jsx, two of
// them hitting /hint from different places with slightly different bodies.
// That duplication is exactly what this removes.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export class ApiTimeoutError extends ApiError {
  constructor(path) {
    super(`The request to ${path} timed out. Try again.`, 408);
    this.name = "ApiTimeoutError";
  }
}

function errorMessage(payload, fallback) {
  if (typeof payload === "string") return payload;
  if (typeof payload?.detail === "string") return payload.detail;
  if (typeof payload?.error === "string") return payload.error;
  if (typeof payload?.message === "string") return payload.message;
  if (payload?.detail || payload?.error) return JSON.stringify(payload.detail ?? payload.error);
  return fallback;
}

async function request(path, options = {}) {
  const { signal: externalSignal, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abort();
    else externalSignal.addEventListener("abort", abort, { once: true });
  }
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === "timeout") {
      throw new ApiTimeoutError(path);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener?.("abort", abort);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      errorMessage(payload, `${response.status} ${response.statusText}`),
      response.status,
      payload
    );
  }

  if (payload?.error && !payload?.verdicts && !payload?.status) {
    throw new ApiError(errorMessage(payload, "The server returned an error."), response.status, payload);
  }
  return payload;
}

async function post(path, body, options = {}) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...options,
  });
}

async function get(path, options = {}) {
  return request(path, options);
}

// -- math, unchanged ---------------------------------------------------------

export const checkSteps = (problem, steps, options) => post("/check", { problem, steps }, options);
export const transcribeLine = (imageBase64, options) =>
  post("/transcribe", { image_base64: imageBase64 }, options);

// -- chemistry ---------------------------------------------------------------

export const chemistryTopics = (options) => get("/chemistry/topics", options);
export const transcribeStructure = (imageBase64, options) =>
  post("/chemistry/transcribe", { image_base64: imageBase64 }, options);
// Chemistry written rather than drawn. Separate from /transcribe because the
// math prompt restricts output to lowercase letters, which destroys every
// chemical formula it touches.
export const transcribeChemistryText = (imageBase64, options) =>
  post("/chemistry/transcribe-text", { image_base64: imageBase64 }, options);
export const renderStructure = (smiles, options) => post("/chemistry/render", { smiles }, options);

export const checkStructure = (targetSmiles, steps, options) =>
  post("/chemistry/check", { target_smiles: targetSmiles, steps }, options);
export const checkFunctionalGroup = (targetGroup, steps, options) =>
  post("/chemistry/functional-group", { target_group: targetGroup, steps }, options);
export const checkIsomer = (referenceSmiles, isomerType, steps, options) =>
  post("/chemistry/isomer", {
    reference_smiles: referenceSmiles,
    isomer_type: isomerType,
    steps,
  }, options);
export const checkName = (targetSmiles, targetName, steps, options) =>
  post("/chemistry/name", {
    target_smiles: targetSmiles || null,
    target_name: targetName || null,
    steps,
  }, options);
export const checkReaction = (payload, options) => post("/chemistry/reaction", payload, options);
export const checkBalance = (referenceEquation, steps, options) =>
  post("/chemistry/balance", { reference_equation: referenceEquation, steps }, options);
export const checkNetIonic = (molecularEquation, steps, options) =>
  post("/chemistry/net-ionic", { molecular_equation: molecularEquation, steps }, options);
export const checkStoichiometry = (payload, options) =>
  post("/chemistry/stoichiometry", payload, options);
export const checkSolutions = (payload, options) => post("/chemistry/solutions", payload, options);
export const checkOxidationState = (formula, element, steps, options) =>
  post("/chemistry/oxidation-state", { formula, element, steps }, options);
export const checkCellPotential = (cathode, anode, steps, options) =>
  post("/chemistry/cell-potential", { cathode, anode, steps }, options);

// The session holds the answer vault and the level-3 budget server-side.
// Nothing it returns can carry a solved value.
export const openSession = (payload, options) => post("/chemistry/session", payload, options);

export const getHint = (payload, options) => post("/hint", payload, options);

// Corpus capture. 404s unless VERITY_CAPTURE_DIR is set on the backend,
// which is how the feature stays off anywhere but a developer machine.
export const captureSample = (payload, options) => post("/capture/chemistry", payload, options);

export { API_BASE };
