import { COLORS, FONT, RADIUS, SUBJECTS, VERDICT_STYLES } from "../theme";
import { readableChemistryLines } from "./lineModel";

function verdictStatus(verdict) {
  if (!verdict) return null;
  return verdict.status ?? (verdict.valid ? "valid" : "invalid");
}

// A state that cannot advance has to say why. The old "Waiting" gave the same
// sentence whether a check was seconds away or could never run at all, which
// is how two rows sat at "Waiting" forever with nothing on screen explaining
// that the question field was empty.
function statusForLine(line, verdict, blocked, ready) {
  const styleFor = (key, label, detail) => ({
    label,
    detail,
    color: VERDICT_STYLES[key].color,
    background: VERDICT_STYLES[key].background,
    symbol: VERDICT_STYLES[key].symbol,
  });

  if (line.unreadable || !line.text.trim()) {
    return styleFor(
      "unsupported",
      "Needs review",
      line.unreadable
        ? "We could not confidently read this row. Correct it before checking."
        : "Enter the transcription for this row before checking."
    );
  }

  if (blocked) {
    return styleFor(
      "waiting",
      "Waiting for earlier row",
      "Correct the earlier unreadable row before checking this step."
    );
  }

  const status = verdictStatus(verdict);
  if (!verdict) {
    return ready
      ? styleFor(
          "waiting",
          "Ready to check",
          "Read and understood. Press Check work below."
        )
      : styleFor(
          "waiting",
          "Not checked yet",
          "Nothing has been checked because the question is not set. Mark a row as the question, or type it in the panel."
        );
  }
  if (status === "valid") {
    return styleFor(
      "valid",
      "Correct step",
      "This follows from the previous chemistry row."
    );
  }
  if (status === "invalid") {
    return styleFor(
      "invalid",
      "Review this step",
      verdict.error_type
        ? `Possible ${verdict.error_type.replaceAll("_", " ")}.`
        : "This does not follow from the previous row."
    );
  }
  return status === "parse_error"
    ? styleFor(
        "parse_error",
        "Could not read",
        "Try rewriting or editing this row's transcription."
      )
    : styleFor(
        "unsupported",
        "Can't check this yet",
        "This type of step is outside the current scope."
      );
}

export default function WrittenChemistrySteps({
  lines,
  verdictsByLine,
  inputMode,
  ready,
  checking,
  questionRow = null,
  onEdit,
  onCheck,
  onReleaseQuestion,
}) {
  // The question is not a step, so it is neither numbered nor checked.
  const stepLines = lines.filter((line) => line.row !== questionRow);
  const questionLine = lines.find((line) => line.row === questionRow) ?? null;
  const canCheck =
    ready && !checking && readableChemistryLines(stepLines).length > 0;

  const checkLabel = checking
    ? "Checking…"
    : !ready
    ? "Set the question first"
    : readableChemistryLines(stepLines).length === 0
    ? "Write your working below the question"
    : "Check work";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {questionLine && (
        <div
          style={{
            padding: 12,
            borderRadius: RADIUS.md,
            border: `1px solid ${SUBJECTS.chemistry.accent}44`,
            background: SUBJECTS.chemistry.accentLight,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: SUBJECTS.chemistry.accent,
              }}
            >
              Your question
            </div>
            <button
              type="button"
              onClick={onReleaseQuestion}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.muted,
                fontSize: 12,
                fontFamily: FONT.sans,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Not the question
            </button>
          </div>
          <div
            style={{
              color: COLORS.text,
              fontFamily: FONT.mono,
              fontSize: 14,
              wordBreak: "break-word",
            }}
          >
            {questionLine.text}
          </div>
        </div>
      )}

      {stepLines.map((line, index) => {
        const blocked = stepLines
          .slice(0, index)
          .some((previous) => previous.unreadable || !previous.text.trim());
        const status = statusForLine(
          line,
          verdictsByLine.get(line.row),
          blocked,
          ready
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
          background: canCheck ? COLORS.primary : COLORS.border,
          color: canCheck ? "#fff" : COLORS.muted,
          border: "none",
          borderRadius: RADIUS.sm,
          fontWeight: 700,
          fontSize: 13,
          cursor: canCheck ? "pointer" : "not-allowed",
        }}
      >
        {checkLabel}
      </button>
    </div>
  );
}
