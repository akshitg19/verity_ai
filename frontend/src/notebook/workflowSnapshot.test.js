import { describe, expect, it } from "vitest";

import {
  deserializeWorkflowSnapshot,
  serializeWorkflowSnapshot,
  workflowProblemFingerprint,
} from "./workflowSnapshot";

describe("page workflow snapshots", () => {
  it("round-trips maps, sets, hint state, and page-scoped chemistry config", () => {
    const snapshot = serializeWorkflowSnapshot({
      subject: "chemistry",
      chemistry: { topicId: "balancing", typeId: "balance", values: { reference_equation: "H2 + O2" } },
      questionRow: 2,
      recognizedLines: [{ row: 3, text: "2H2 + O2" }],
      verdictsByLine: new Map([[3, { status: "valid" }]]),
      dismissedRows: new Set([4]),
      hintLevel: 2,
      hintText: "Compare oxygen atoms.",
    });

    const restored = deserializeWorkflowSnapshot(snapshot);
    expect(restored.schemaVersion).toBe(1);
    expect(restored.chemistry.topicId).toBe("balancing");
    expect(restored.verdictsByLine.get(3).status).toBe("valid");
    expect(restored.dismissedRows.has(4)).toBe(true);
    expect(restored.hintLevel).toBe(2);
  });

  it("changes the problem fingerprint when page configuration changes", () => {
    const first = workflowProblemFingerprint({ subject: "chemistry", problemText: "A", chemistry: { typeId: "one" } });
    const second = workflowProblemFingerprint({ subject: "chemistry", problemText: "A", chemistry: { typeId: "two" } });
    expect(first).not.toBe(second);
  });
});
