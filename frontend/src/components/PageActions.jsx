import { COLORS, RADIUS, SHADOW, SUBJECTS } from "../theme";

// The two things you reach for while writing, put where the hand already is.
//
// Both of these used to live in the top right of the toolbar, which on a
// tablet is the far corner from a right hand resting on the page. A floating
// action at the bottom is the pattern every drawing and notes app settles on,
// and it is reachable with the thumb of the hand that is not holding the pen.

export default function PageActions({
  mode,
  chemistry,
  strokeCount,
  activeLineNumber,
  transcribing,
  onFinishLine,
  onReadPage,
  onNewQuestion,
}) {
  const accent = SUBJECTS[mode].accent;
  const empty = strokeCount === 0;

  const primary =
    mode === "math"
      ? {
          label:
            transcribing
              ? "Reading…"
              : activeLineNumber === null
              ? "Check line"
              : `Check line ${activeLineNumber}`,
          onClick: onFinishLine,
          disabled: empty || activeLineNumber === null || transcribing,
        }
      : {
          label: chemistry.reading
            ? "Reading…"
            : chemistry.isDrawing
            ? "Read the page"
            : "Read the rows",
          onClick: onReadPage,
          disabled: empty || chemistry.reading,
        };

  return (
    <div
      className="page-actions"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
        transform: "translateX(-50%)",
        zIndex: 14,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 6,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.pill,
        boxShadow: SHADOW.float,
        fontFamily: "inherit",
        // Out of the way while the page is blank. There is nothing to read
        // and nothing to clear, so it fades until there is.
        opacity: empty ? 0.55 : 1,
        transition: "opacity 200ms ease",
      }}
    >
      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled}
        style={{
          padding: "10px 20px",
          background: accent,
          color: "#fff",
          border: "none",
          borderRadius: RADIUS.pill,
          fontFamily: "inherit",
          fontSize: 13.5,
          fontWeight: 700,
          whiteSpace: "nowrap",
          opacity: primary.disabled ? 0.45 : 1,
          cursor: primary.disabled ? "not-allowed" : "pointer",
        }}
      >
        {primary.label}
      </button>
      <button
        type="button"
        onClick={onNewQuestion}
        disabled={empty}
        title="Clear the page for the next question"
        style={{
          padding: "10px 16px",
          background: "transparent",
          color: COLORS.muted,
          border: "none",
          borderRadius: RADIUS.pill,
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: "nowrap",
          opacity: empty ? 0.45 : 1,
          cursor: empty ? "not-allowed" : "pointer",
        }}
      >
        New question
      </button>
    </div>
  );
}
