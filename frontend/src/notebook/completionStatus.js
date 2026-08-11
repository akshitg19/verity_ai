const statusOf = (verdict) =>
  verdict?.status ?? (verdict?.valid === true ? "valid" : verdict?.valid === false ? "invalid" : null);

export function deriveCompletionStatus({ subject, mathVerdicts, chemistryVerdicts, wholePageVerdict } = {}) {
  const verdicts = subject === "math"
    ? [...(mathVerdicts?.values?.() ?? mathVerdicts ?? [])]
    : wholePageVerdict
    ? [wholePageVerdict]
    : [...(chemistryVerdicts?.values?.() ?? chemistryVerdicts ?? [])];
  const statuses = verdicts.map(statusOf).filter(Boolean);
  if (statuses.includes("invalid")) return "invalid";
  if (statuses.includes("parse_error")) return "parse_error";
  if (statuses.includes("unsupported")) return "unsupported";
  if (statuses.length && statuses.every((status) => status === "valid")) return "valid";
  return null;
}
