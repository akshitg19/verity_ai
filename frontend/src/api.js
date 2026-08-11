// One module, one place to change a base URL.
//
// Before this there were six fetch calls scattered through App.jsx, two of
// them hitting /hint from different places with slightly different bodies.
// That duplication is exactly what this removes.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const DEFAULT_TIMEOUT_MS = 30_000;
const HINT_TIMEOUT_MS = 120_000;

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

export class ApiCancelledError extends ApiError {
  constructor(path) {
    super(`The request to ${path} was cancelled.`, 499);
    this.name = "ApiCancelledError";
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

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, signal.reason ?? new Error("Request aborted"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error)
    );
  });
}

async function request(path, options = {}) {
  const { signal: externalSignal, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abort();
    else externalSignal.addEventListener("abort", abort, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort("timeout");
  }, timeoutMs);

  try {
    const response = await abortable(fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
    }), controller.signal);
    // Keep the timeout alive until the body has been consumed. A fetch can
    // resolve headers immediately while a streaming response stalls.
    const text = await abortable(response.text(), controller.signal);
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
  } catch (error) {
    if (timedOut || controller.signal.reason === "timeout") {
      throw new ApiTimeoutError(path);
    }
    if (externalSignal?.aborted) throw error;
    if (controller.signal.aborted && error?.name === "AbortError") {
      throw new ApiCancelledError(path);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener?.("abort", abort);
  }
}

// The optional shared-secret header. Absent unless VITE_API_SECRET is set at
// build time, which matches the backend defaulting the check off, so nothing
// changes until both sides are turned on together.
//
// Worth being clear about what it is: this value ships inside the JavaScript
// bundle, so anyone who opens developer tools can read it. It keeps a crawler
// or a casually forwarded link from spending our Vertex AI quota. It is not
// authentication and must never be described as any.
const API_SECRET = import.meta.env.VITE_API_SECRET ?? "";

function withSecret(headers = {}) {
  return API_SECRET ? { ...headers, "X-Verity-Key": API_SECRET } : headers;
}

async function post(path, body, options = {}) {
  const { headers, ...rest } = options;
  return request(path, {
    method: "POST",
    body: JSON.stringify(body),
    ...rest,
    headers: withSecret({ "Content-Type": "application/json", ...headers }),
  });
}

async function get(path, options = {}) {
  const { headers, ...rest } = options;
  return request(path, { ...rest, headers: withSecret(headers) });
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
// "Draw a structure with this formula". Looser than checkStructure on
// purpose: a formula does not determine a structure, so every isomer of it
// is a correct answer to the question that was actually asked.
export const checkFormulaStructure = (targetFormula, steps, options) =>
  post("/chemistry/formula-structure", { target_formula: targetFormula, steps }, options);

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

// Hints get their own, much longer budget. Every level is a live generation
// call, and level 2 additionally solves the generated example with our own
// engine and regenerates it once if verification fails. Measured against the
// deployed service: level 1 around 9s, level 2 between 10s and 21s when it
// succeeds and 33s on the attempt that gives up and serves the floor. The
// 30s default was therefore aborting real hints in the browser and reporting
// a timeout for work the server had already done.
export const getHint = (payload, options) =>
  post("/hint", payload, { timeoutMs: HINT_TIMEOUT_MS, ...options });

// Corpus capture. 404s unless VERITY_CAPTURE_DIR is set on the backend,
// which is how the feature stays off anywhere but a developer machine.
export const captureSample = (payload, options) => post("/capture/chemistry", payload, options);

export { API_BASE };
