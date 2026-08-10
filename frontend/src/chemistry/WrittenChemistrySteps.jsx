import { COLORS, FONT, RADIUS } from "../theme";
import { readableChemistryLines } from "./lineModel";

function verdictStatus(verdict) {
  if (!verdict) return null;
  return verdict.status ?? (verdict.valid ? "valid" : "invalid");
}

function statusForLine(line, verdict, blocked) {
  if (line.unreadable || !line.text.trim()) {
    return {
      label: "Needs review",
      detail: line.unreadable
        ? "We could not confidently read this row. Correct it before checking."
        : "Enter the transcription for this row before checking.",
      color: "#a96b1f",
      background: "#fff7e8",
      symbol: "!",
    };
  }

  if (blocked) {
    return {
      label: "Waiting for earlier row",
      detail: "Correct the earlier unreadable row before checking this step.",
      color: COLORS.muted,
      background: "#f3f5f4",
      symbol: "…",
    };
  }

  const status = verdictStatus(verdict);
  if (!verdict) {
    return {
      label: "Waiting",
      detail: "This row will be checked as a separate chemistry step.",
      color: COLORS.muted,
      background: "#f3f5f4",
      symbol: "…",
    };
  }
  if (status === "valid") {
    return {
      label: "Correct step",
      detail: "This follows from the previous chemistry row.",
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
        : "This does not follow from the previous row.",
      color: COLORS.danger,
      background: "#fff0f0",
      symbol: "!",
    };
  }
  return {
    label: status === "parse_error" ? "Could not check" : "Not supported yet",
    detail:
      status === "parse_error"
        ? "Try rewriting or editing this row's transcription."
        : "This type of step is outside the current scope.",
    color: "#a96b1f",
    background: "#fff7e8",
    symbol: "?",
  };
}

export default function WrittenChemistrySteps({
  lines,
  verdictsByLine,
  inputMode,
  ready,
  checking,
  onEdit,
  onCheck,
}) {
  const canCheck =
    ready && !checking && readableChemistryLines(lines).length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {lines.map((line, index) => {
        const blocked = lines
          .slice(0, index)
          .some((previous) => previous.unreadable || !previous.text.trim());
        const status = statusForLine(
          line,
          verdictsByLine.get(line.row),
          blocked
        );
        return (
          <div
            key={line.row}
            style={{
              padding: 12,
              borderRadius: RADIUS.md,
              border: `1px solid ${status.color}33`,
              background: status.background,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: status.color,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {status.symbol}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 3,
                  }}
                >
                  <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>
                    Step {index + 1}
                  </div>
                  <div style={{ color: status.color, fontSize: 12, fontWeight: 700 }}>
                    {status.label}
                  </div>
                </div>
                <div
                  style={{
                    color: COLORS.muted,
                    fontSize: 12,
                    lineHeight: 1.35,
                    marginBottom: 8,
                  }}
                >
                  {status.detail}
                </div>
                <input
                  aria-label={`Chemistry step ${index + 1}`}
                  type="text"
                  value={line.text}
                  placeholder={line.unreadable ? "Type what you wrote" : ""}
                  onChange={(event) => onEdit(line.row, event.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 11px",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 9,
                    background: COLORS.surface,
                    color: COLORS.text,
                    fontFamily: inputMode === "numeric" ? FONT.sans : FONT.mono,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onCheck}
        disabled={!canCheck}
        style={{
          width: "100%",
          padding: "9px 14px",
          background: canCheck ? COLORS.primary : "#d8ddda",
          color: "#fff",
          border: "none",
          borderRadius: RADIUS.sm,
          fontWeight: 700,
          fontSize: 13,
          cursor: canCheck ? "pointer" : "not-allowed",
        }}
      >
        {checking ? "Checking…" : !ready ? "Fill in the question above first" : "Check work"}
      </button>
    </div>
  );
}
