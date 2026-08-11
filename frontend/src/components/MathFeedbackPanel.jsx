import { COLORS, verdictStyle } from "../theme";
import {
  buildMathCheckInput,
  orderedMathLines,
} from "../math/lineModel";
import { MATH_TOPICS } from "../math/topics";
import HintLadder from "./HintLadder";

function MathTopicPicker({ topicId, onChoose }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 6,
        marginBottom: 14,
      }}
    >
      {MATH_TOPICS.map((topic) => {
        const selected = topic.id === topicId;
        const disabled = !topic.implemented;

        return (
          <button
            key={topic.id}
            type="button"
            title={topic.blurb}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChoose(topic.id)}
            style={{
              padding: "9px 6px",
              borderRadius: 10,
              border: `1px solid ${
                selected ? COLORS.primary : COLORS.border
              }`,
              background: selected ? COLORS.primaryLight : COLORS.surface,
              color: selected
                ? COLORS.primary
                : disabled
                ? COLORS.muted
                : COLORS.text,
              fontSize: 10.5,
              fontWeight: selected ? 700 : 500,
              lineHeight: 1.25,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 15 }}>{topic.glyph}</span>

            <span>{topic.label}</span>

            {disabled && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                }}
              >
                coming next
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

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
      color: "var(--v-unsupported)",
      background: "var(--v-unsupported-bg)",
      symbol: "!",
    };
  }
  if (blocked) {
    return {
      label: "Waiting for earlier line",
      detail: "Waiting on the line above.",
      color: COLORS.muted,
      background: "var(--v-waiting-bg)",
      symbol: "…",
    };
  }
  if (isProblem) {
    return {
      label: "Problem",
      detail: "This is the question being solved.",
      color: COLORS.primary,
      background: COLORS.primaryLight,
      symbol: "P",
    };
  }
  const status = verdictStatus(verdict);
  if (!verdict) {
    return {
      label: "Waiting",
      detail: "This line has not been checked yet.",
      color: COLORS.muted,
      background: "var(--v-waiting-bg)",
      symbol: "…",
    };
  }
  if (status === "valid") {
    return {
      label: "Correct step",
      detail: "This follows from the previous line.",
      color: "var(--v-valid)",
      background: "var(--v-valid-bg)",
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
      background: "var(--v-invalid-bg)",
      symbol: "!",
    };
  }
  const fallbackStyle = verdictStyle(status === "parse_error" ? "parse_error" : "unsupported");
  return {
    label: status === "parse_error" ? "Could not check" : "Not supported yet",
    detail:
      status === "parse_error"
        ? "Try rewriting or editing the transcription."
        : "This type of step is outside the current scope.",
    color: fallbackStyle.color,
    background: fallbackStyle.background,
    symbol: fallbackStyle.symbol,
  };
}

export default function MathFeedbackPanel({ workflow }) {
  const {
    topic,
    topicId,
    handleTopicChange,
    problem,
    lines,
    verdictsByLine,
    firstWrongLine,
    hintLevel,
    hintData,
    hintError,
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

  const emptyState =
    lines.length === 0 ? (
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
        <div
          style={{
            width: 48,
            height: 48,
            display: "grid",
            placeItems: "center",
            marginBottom: 14,
            borderRadius: "50%",
            background: COLORS.primaryLight,
            color: COLORS.primary,
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          ✎
        </div>

        <div
          style={{
            marginBottom: 7,
            color: COLORS.text,
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Start writing your problem
        </div>

        <div
          style={{
            maxWidth: 240,
            color: COLORS.muted,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Write the problem on the first line, then finish the line to begin receiving live feedback.
        </div>
      </div>
    ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <MathTopicPicker topicId={topicId} onChoose={handleTopicChange} />

      {emptyState}

      {lines.length > 0 &&
        orderedLines.map((line, index) => {
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
        <HintLadder
          level={hintLevel}
          hint={hintData?.hint ?? null}
          workedExample={hintData?.worked_example ?? null}
          terminalStep={Boolean(hintData?.terminal_step)}
          levelThreeRemaining={hintData?.level_3_remaining ?? null}
          source={hintData?.source ?? null}
          resource={hintData?.resource ?? null}
          error={hintError}
          loading={hintLoading}
          onRequest={handleGetHint}
          onCancel={cancelHint}
          disabled={false}
        />
      )}
    </div>
  );
}
