import { COLORS, FONT, RADIUS, verdictStyle } from "../theme";
import { categoryLabel } from "./verdictLabels";

// Four outcomes, four treatments, and the provenance badge.
//
// `unsupported` and `parse_error` are our limitations, not the student's
// mistakes. Amber and violet keep them visually distinct from the red that
// means "you got this wrong", because showing a capability limit as a
// student error is a bug, not a rounding.

function ProvenanceBadge({ judgedBy }) {
  // A model verdict must never look identical to a proven one. The wording
  // is deliberately calm: a student should read "checked differently", not
  // "we might be wrong about you".
  const proven = judgedBy !== "model";
  return (
    <span
      title={
        proven
          ? "Proved by deterministic chemistry software"
          : "Read by the AI tutor and not provable by our chemistry engine"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        borderRadius: RADIUS.pill,
        border: `1px solid ${proven ? "#267a5544" : "#8a6d3b44"}`,
        background: proven ? "#edf8f2" : "#fdf6e6",
        color: proven ? "#267a55" : "#8a6d3b",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >
      {proven ? "✓ proven" : "◇ AI-checked"}
    </span>
  );
}

export default function VerdictCard({
  title,
  verdict,
  waitingDetail,
  children,
  onConfirm,
}) {
  const status = verdict
    ? verdict.status ?? (verdict.valid ? "valid" : "invalid")
    : "waiting";
  const style = verdictStyle(status);
  const category = categoryLabel(verdict?.error_type);

  const detail = !verdict
    ? waitingDetail ?? "This hasn't been checked yet."
    : status === "valid"
    ? "This matches what the problem asks for."
    : status === "invalid"
    ? category
      ? `Something here is a ${category}.`
      : "This doesn't follow."
    : status === "parse_error"
    ? "We couldn't read this. Try again, or correct it below. This isn't a mistake on your part."
    : "This is outside what we can check yet. That's our limit, not your error.";

  return (
    <div
      style={{
        padding: 12,
        borderRadius: RADIUS.lg,
        border: `1px solid ${style.border}`,
        background: style.background,
        fontFamily: FONT.sans,
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
            background: style.color,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {style.symbol}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 3,
              flexWrap: "wrap",
            }}
          >
            <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>
              {title}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {verdict?.judged_by && (
                <ProvenanceBadge judgedBy={verdict.judged_by} />
              )}
              <div
                style={{ color: style.color, fontSize: 12, fontWeight: 700 }}
              >
                {verdict ? style.label : "Waiting"}
              </div>
            </div>
          </div>

          <div
            style={{
              color: COLORS.muted,
              fontSize: 12,
              lineHeight: 1.4,
              marginBottom: children ? 8 : 0,
            }}
          >
            {detail}
          </div>

          {verdict?.needs_confirmation && (
            // Self-consistency disagreed. Asking beats guessing: a confident
            // wrong verdict is the failure that ends a classroom trial.
            <div
              style={{
                margin: "0 0 8px",
                padding: 10,
                borderRadius: RADIUS.md,
                background: "#fff",
                border: `1px dashed ${style.color}66`,
                fontSize: 12,
                lineHeight: 1.45,
                color: COLORS.text,
              }}
            >
              We read this step twice and got two different answers, so we're
              not going to give you a verdict on it.
              {onConfirm && (
                <button
                  type="button"
                  onClick={onConfirm}
                  style={{
                    display: "block",
                    marginTop: 8,
                    padding: "6px 12px",
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.surface,
                    color: COLORS.text,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  It's written the way I meant, check again
                </button>
              )}
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
