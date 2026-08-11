import { COLORS } from "../theme";
import {
  buildMathCheckInput,
  orderedMathLines,
} from "../math/lineModel";

function verdictStatus(verdict) {
  if (!verdict) return null;
  return verdict.status ?? (verdict.valid ? "valid" : "invalid");
}

function lineStatus(line, isProblem, verdict, blocked) {
  if (line.unreadable || !line.text.trim()) {
    return {
      label: "Needs review",
      detail: line.unreadable
        ? "We could not confidently read this line."
        : "Type what this line says.",
      color: "#a96b1f",
      background: "#fff7e8",
      symbol: "!",
    };
  }
  if (blocked) {
    return {
      label: "Waiting for earlier line",
      detail: "Waiting on the line above.",
      color: COLORS.muted,
      background: "#f3f5f4",
      symbol: "…",
    };
  }
  if (isProblem) {
    return {
      label: "Problem",
      detail: "This is the question being solved.",
      color: "#486b91",
      background: "#edf4fb",
      symbol: "P",
    };
  }
  const status = verdictStatus(verdict);
  if (!verdict) {
    return {
      label: "Waiting",
      detail: "This line has not been checked yet.",
      color: COLORS.muted,
      background: "#f3f5f4",
      symbol: "…",
    };
  }
  if (status === "valid") {
    return {
      label: "Correct step",
      detail: "This follows from the previous line.",
      color: "#267a55",
      background: "#edf8f2",
      symbol: "✓",
    };
  }
  if (status === "invalid") {
    return {
      label: "Review this step",
      detail: verdict.error_type
        ? `Possible ${verdict.error_type.replaceAll("_", " ")}.`
        : "This does not follow from the previous line.",
      color: COLORS.danger,
      background: "#fff0f0",
      symbol: "!",
    };
  }
  return {
    label: status === "parse_error" ? "Could not check" : "Not supported yet",
    detail:
      status === "parse_error"
        ? "Try rewriting or editing the transcription."
        : "This type of step is outside the current scope.",
    color: "#a96b1f",
    background: "#fff7e8",
    symbol: "?",
  };
}

export default function MathFeedbackPanel({ workflow }) {
  const {
    problem,
    lines,
    verdictsByLine,
    firstWrongLine,
    hintLevel,
    hintText,
    hintLoading,
    handleLineEdit,
    handleLineEditDone,
    handleGetHint,
  } = workflow;
  const orderedLines = orderedMathLines(lines);
  const { handwrittenProblemRow, readableLines } = buildMathCheckInput(
    orderedLines,
    problem
  );
  const readableRows = new Set(readableLines.map((line) => line.row));

  if (lines.length === 0) {
    return (
      <div
        style={{
          minHeight: 260,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 24,
          boxSizing: "border-box",
          borderRadius: 12,
          background: COLORS.background,
          border: `1px dashed ${COLORS.border}`,
        }}
      >
        <div style={{ width: 48, height: 48, display: "grid", placeItems: "center", marginBottom: 14, borderRadius: "50%", background: COLORS.primaryLight, color: COLORS.primary, fontSize: 22, fontWeight: 700 }}>
          ✎
        </div>
        <div style={{ marginBottom: 7, color: COLORS.text, fontSize: 16, fontWeight: 700 }}>
          Start writing your problem
        </div>
        <div style={{ maxWidth: 240, color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>
          Write the problem on the first line, then finish the line to begin receiving live feedback.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {orderedLines.map((line, index) => {
        const blocked =
          Boolean(line.text.trim()) &&
          !line.unreadable &&
          !readableRows.has(line.row);
        const status = lineStatus(
          line,
          line.row === handwrittenProblemRow,
          verdictsByLine.get(line.row),
          blocked
        );
        return (
          <div key={line.row} style={{ padding: 12, borderRadius: 12, border: `1px solid ${status.color}33`, background: status.background }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: status.color, color: "#fff", fontSize: 13, fontWeight: 700 }}>
                {status.symbol}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                  <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>Line {index + 1}</div>
                  <div style={{ color: status.color, fontSize: 12, fontWeight: 700 }}>{status.label}</div>
                </div>
                <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.35, marginBottom: 8 }}>{status.detail}</div>
                <input
                  aria-label={`Math line ${index + 1}`}
                  type="text"
                  value={line.text}
                  placeholder={line.unreadable ? "Type what you wrote" : ""}
                  onChange={(event) => handleLineEdit(line.row, event.target.value)}
                  onBlur={() => handleLineEditDone(line.row)}
                  onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: `1px solid ${COLORS.border}`, borderRadius: 9, background: COLORS.surface, color: COLORS.text, fontFamily: "monospace", fontSize: 14, outline: "none" }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {firstWrongLine !== null && (
        <div style={{ marginTop: 4, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
          {hintText && (
            <div style={{ marginBottom: 10, padding: 12, borderRadius: 10, background: COLORS.primaryLight, color: COLORS.text, lineHeight: 1.45, fontSize: 13 }}>
              <div style={{ color: COLORS.primary, fontWeight: 700, marginBottom: 4 }}>Hint {hintLevel} of 3</div>
              {hintText}
            </div>
          )}
          <button
            type="button"
            onClick={handleGetHint}
            disabled={hintLoading || hintLevel >= 3}
            style={{ width: "100%", padding: "10px 14px", background: hintLoading || hintLevel >= 3 ? "#d8ddda" : COLORS.primary, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: hintLoading || hintLevel >= 3 ? "not-allowed" : "pointer" }}
          >
            {hintLoading ? "Preparing hint…" : hintLevel === 0 ? "Get a hint" : hintLevel >= 3 ? "All hints shown" : "Show another hint"}
          </button>
        </div>
      )}
    </div>
  );
}
