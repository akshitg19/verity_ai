export const WORKFLOW_SCHEMA_VERSION = 1;

const mapEntries = (value) =>
  value instanceof Map ? [...value.entries()] : Array.isArray(value) ? value : [];

const setValues = (value) =>
  value instanceof Set ? [...value.values()] : Array.isArray(value) ? value : [];

export function serializeWorkflowSnapshot(snapshot = {}) {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    subject: snapshot.subject ?? snapshot.mode ?? "math",
    mode: snapshot.mode ?? snapshot.subject ?? "math",
    chemistry: snapshot.chemistry ?? null,
    problemText: snapshot.problemText ?? snapshot.problem ?? "",
    problemFingerprint: snapshot.problemFingerprint ?? null,
    answer: snapshot.answer ?? "",
    read: Boolean(snapshot.read),
    unreadable: Boolean(snapshot.unreadable),
    confidence: snapshot.confidence ?? "high",
    preview: snapshot.preview ?? null,
    questionRow: snapshot.questionRow ?? null,
    recognizedLines: [...(snapshot.recognizedLines ?? snapshot.lines ?? [])],
    verdictsByLine: mapEntries(snapshot.verdictsByLine),
    wholePageVerdict: snapshot.wholePageVerdict ?? snapshot.verdict ?? null,
    firstWrongLine: snapshot.firstWrongLine ?? null,
    firstWrongRow: snapshot.firstWrongRow ?? null,
    dismissedRows: setValues(snapshot.dismissedRows),
    hintsUsed: snapshot.hintsUsed ?? snapshot.hintLevel ?? 0,
    hintLevel: snapshot.hintLevel ?? 0,
    hint: snapshot.hint ?? snapshot.hintText ?? null,
    hintText: snapshot.hintText ?? snapshot.hint?.hint ?? null,
    lastResult: snapshot.lastResult ?? snapshot.status ?? null,
    updatedAt: snapshot.updatedAt ?? Date.now(),
  };
}

export function deserializeWorkflowSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const normalized = serializeWorkflowSnapshot(snapshot);
  return {
    ...normalized,
    verdictsByLine: new Map(normalized.verdictsByLine),
    dismissedRows: new Set(normalized.dismissedRows),
  };
}

export function workflowProblemFingerprint({ subject, problemText, chemistry } = {}) {
  return JSON.stringify({
    subject: subject ?? "math",
    problemText: problemText ?? "",
    chemistry: chemistry ?? null,
  });
}

export function emptyWorkflowSnapshot(subject = "math") {
  return serializeWorkflowSnapshot({
    subject,
    mode: subject,
    chemistry: subject === "chemistry" ? {} : null,
  });
}
