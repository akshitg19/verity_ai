// One module, one place to change a base URL.
//
// Before this there were six fetch calls scattered through App.jsx, two of
// them hitting /hint from different places with slightly different bodies.
// That duplication is exactly what this removes.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function post(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new ApiError(
      detail?.detail || `${response.status} ${response.statusText}`,
      response.status
    );
  }
  return response.json();
}

async function get(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new ApiError(`${response.status} ${response.statusText}`, response.status);
  }
  return response.json();
}

// -- math, unchanged ---------------------------------------------------------

export const checkSteps = (problem, steps) => post("/check", { problem, steps });
export const transcribeLine = (imageBase64) =>
  post("/transcribe", { image_base64: imageBase64 });

// -- chemistry ---------------------------------------------------------------

export const chemistryTopics = () => get("/chemistry/topics");
export const transcribeStructure = (imageBase64) =>
  post("/chemistry/transcribe", { image_base64: imageBase64 });
// Chemistry written rather than drawn. Separate from /transcribe because the
// math prompt restricts output to lowercase letters, which destroys every
// chemical formula it touches.
export const transcribeChemistryText = (imageBase64) =>
  post("/chemistry/transcribe-text", { image_base64: imageBase64 });
export const renderStructure = (smiles) => post("/chemistry/render", { smiles });

export const checkStructure = (targetSmiles, steps) =>
  post("/chemistry/check", { target_smiles: targetSmiles, steps });
export const checkFunctionalGroup = (targetGroup, steps) =>
  post("/chemistry/functional-group", { target_group: targetGroup, steps });
export const checkIsomer = (referenceSmiles, isomerType, steps) =>
  post("/chemistry/isomer", {
    reference_smiles: referenceSmiles,
    isomer_type: isomerType,
    steps,
  });
export const checkName = (targetSmiles, targetName, steps) =>
  post("/chemistry/name", {
    target_smiles: targetSmiles || null,
    target_name: targetName || null,
    steps,
  });
export const checkReaction = (payload) => post("/chemistry/reaction", payload);
export const checkBalance = (referenceEquation, steps) =>
  post("/chemistry/balance", { reference_equation: referenceEquation, steps });
export const checkNetIonic = (molecularEquation, steps) =>
  post("/chemistry/net-ionic", { molecular_equation: molecularEquation, steps });
export const checkStoichiometry = (payload) =>
  post("/chemistry/stoichiometry", payload);
export const checkSolutions = (payload) => post("/chemistry/solutions", payload);
export const checkOxidationState = (formula, element, steps) =>
  post("/chemistry/oxidation-state", { formula, element, steps });
export const checkCellPotential = (cathode, anode, steps) =>
  post("/chemistry/cell-potential", { cathode, anode, steps });

// The session holds the answer vault and the level-3 budget server-side.
// Nothing it returns can carry a solved value.
export const openSession = (payload) => post("/chemistry/session", payload);

export const getHint = (payload) => post("/hint", payload);

// Corpus capture. 404s unless VERITY_CAPTURE_DIR is set on the backend,
// which is how the feature stays off anywhere but a developer machine.
export const captureSample = (payload) => post("/capture/chemistry", payload);

export { API_BASE };
