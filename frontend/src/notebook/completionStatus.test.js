import { describe, expect, it } from "vitest";

import { deriveCompletionStatus } from "./completionStatus";

describe("sidebar completion status", () => {
  it.each([
    ["math", new Map([[1, { status: "valid" }]]), null, "valid"],
    ["math", new Map([[1, { status: "invalid" }]]), null, "invalid"],
    ["chemistry", new Map([[1, { status: "unsupported" }]]), null, "unsupported"],
    ["chemistry", new Map(), { status: "parse_error" }, "parse_error"],
  ])("derives %s status", (subject, verdicts, wholePageVerdict, expected) => {
    expect(deriveCompletionStatus({ subject, mathVerdicts: verdicts, chemistryVerdicts: verdicts, wholePageVerdict })).toBe(expected);
  });
});
