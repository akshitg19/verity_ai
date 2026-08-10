import { COLORS, RADIUS, SHADOW, SUBJECTS } from "../theme";

const CARD_WIDTH = 268;
const GAP = 12;

// The offer that turns written ink into the problem statement.
//
// Shaped like the iOS text-selection menu on purpose: it appears beside what
// it is talking about, says one thing, and goes away. Two actions, not five.
// A student's first instinct is to write the question on the page, and making
// them type it into a panel instead puts a seam down the middle of a
// handwriting app.
export default function QuestionPrompt({ bounds, text, onUseAsQuestion, onDismiss }) {
  if (!bounds || !text?.trim()) return null;

  // Above the ink by default so it never covers what it refers to, and below
  // when the line is too near the top of the page for that to fit.
  const above = bounds.minY > 96;
  const top = above ? bounds.minY - GAP : bounds.maxY + GAP;
  const left = Math.max(8, bounds.minX - 6);

  return (
    <div
      role="dialog"
      aria-label="Use this line as the question"
      style={{
        position: "absolute",
        top,
        left,
        width: CARD_WIDTH,
        transform: above ? "translateY(-100%)" : "none",
        zIndex: 15,
        padding: 12,
        boxSizing: "border-box",
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.float,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: SUBJECTS.chemistry.accent,
          marginBottom: 5,
        }}
      >
        Is this the question?
      </div>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          color: COLORS.text,
          background: COLORS.background,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.sm,
          padding: "6px 8px",
          marginBottom: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onUseAsQuestion}
          style={{
            flex: 1,
            padding: "9px 10px",
            background: SUBJECTS.chemistry.accent,
            color: "#fff",
            border: "none",
            borderRadius: RADIUS.sm,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "sans-serif",
            cursor: "pointer",
          }}
        >
          Use as question
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            flex: 1,
            padding: "9px 10px",
            background: COLORS.surface,
            color: COLORS.muted,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.sm,
            fontSize: 13,
            fontFamily: "sans-serif",
            cursor: "pointer",
          }}
        >
          It's my working
        </button>
      </div>
    </div>
  );
}
