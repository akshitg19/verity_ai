import { useState } from "react";

import ChemistryPanel from "../chemistry/ChemistryPanel";
import { COLORS, RADIUS, SHADOW, SUBJECTS } from "../theme";
import MathFeedbackPanel from "./MathFeedbackPanel";

// Live feedback, as a drawer over a full page rather than a card beside it.
//
// The page is the product. Anything that permanently takes a column off it is
// a panel the student writes around, so this slides: closed, the sheet is the
// whole screen and a thin tab is the only thing on top of it; open, it covers
// the right-hand edge and slides back out of the way with one tap. The tab
// carries the state worth glancing at, so closing the drawer never means
// losing track of whether something is wrong.

const PANEL_OPEN_KEY = "verity.panelOpen";

function readPanelOpen() {
  try {
    return globalThis.localStorage?.getItem(PANEL_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function rememberPanelOpen(open) {
  try {
    globalThis.localStorage?.setItem(PANEL_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Remembering is a convenience, not a requirement.
  }
}

// What the tab says when the drawer is shut. One word and a colour beats a
// sentence nobody reads.
function tabState({ mode, math, chemistry, transcribing }) {
  if (transcribing) return { label: "Reading", tone: "var(--v-unsupported)" };
  const flagged =
    mode === "chemistry"
      ? chemistry.firstWrongRow !== null ||
        chemistry.verdict?.status === "invalid"
      : math.firstWrongLine !== null;
  if (flagged) return { label: "1 to fix", tone: "var(--v-invalid)" };

  const checked =
    mode === "chemistry"
      ? chemistry.verdictsByLine.size > 0 || Boolean(chemistry.verdict)
      : math.verdictsByLine.size > 0;
  if (checked) return { label: "All good", tone: "var(--v-valid)" };
  return { label: "Feedback", tone: COLORS.muted };
}

export default function FeedbackPanel({
  mode,
  math,
  chemistry,
  captureEnabled,
  onCapture,
  onChemistryProblemChange,
  transcribing,
  status,
}) {
  const [open, setOpen] = useState(readPanelOpen);
  const accent = SUBJECTS[mode].accent;
  const state = tabState({ mode, math, chemistry, transcribing });

  const toggle = () => {
    setOpen((current) => {
      rememberPanelOpen(!current);
      return !current;
    });
  };

  // A line going wrong is the one thing worth opening the drawer for by
  // itself. Everything else waits to be asked for.
  //
  // Tracked against the last row we opened for rather than set from inside an
  // effect, so a student who slides the drawer away while a line is still
  // flagged does not have it slide straight back at them.
  const flaggedRow =
    mode === "chemistry" ? chemistry.firstWrongRow : math.firstWrongLine;
  const [announcedRow, setAnnouncedRow] = useState(null);
  if (flaggedRow !== null && flaggedRow !== undefined && flaggedRow !== announcedRow) {
    setAnnouncedRow(flaggedRow);
    if (!open) {
      setOpen(true);
      rememberPanelOpen(true);
    }
  }

  return (
    <>
      {(status?.error || status?.warning || status?.notice) && (
        <div
          className="feedback-status"
          role={status.error ? "alert" : "status"}
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 12,
            left: 12,
            padding: "10px 16px",
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.sm,
            fontFamily: "monospace",
            maxWidth: "min(80vw, 460px)",
            color: status.warning || status.notice ? "var(--v-unsupported)" : COLORS.danger,
            zIndex: 30,
          }}
        >
          {status.warning ?? status.notice ?? status.error}
        </div>
      )}

      {/* The tab. Always there, on the edge, so the drawer is one tap away
          from anywhere on the page and never has to be hunted for. */}
      <button
        type="button"
        className="feedback-tab"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="live-feedback"
        title={open ? "Slide the feedback away" : "Slide the feedback in"}
        style={{
          position: "fixed",
          top: "50%",
          right: open ? 372 : 0,
          transform: "translateY(-50%)",
          zIndex: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 10px",
          writingMode: "vertical-rl",
          background: COLORS.surface,
          color: COLORS.text,
          border: `1px solid ${COLORS.border}`,
          borderRight: open ? `1px solid ${COLORS.border}` : "none",
          borderRadius: open
            ? `${RADIUS.md}px 0 0 ${RADIUS.md}px`
            : `${RADIUS.md}px 0 0 ${RADIUS.md}px`,
          boxShadow: SHADOW.float,
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.3,
          cursor: "pointer",
          transition: "right 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: state.tone,
          }}
        />
        {open ? "Hide" : state.label}
      </button>

      <aside
        id="live-feedback"
        className="feedback-panel"
        aria-label="Live feedback"
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 88,
          right: 16,
          width: 360,
          maxHeight: "calc(100dvh - 104px)",
          display: "flex",
          flexDirection: "column",
          zIndex: 15,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.card,
          boxSizing: "border-box",
          fontFamily: "inherit",
          overflow: "hidden",
          // Slides rather than appears. A panel that pops into existence next
          // to your hand is startling on a tablet; one that slides reads as
          // the same object moving.
          transform: open ? "translateX(0)" : "translateX(calc(100% + 24px))",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition:
            "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 14px",
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: state.tone,
            }}
          />
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>
            {transcribing ? "Reading your writing" : "Live feedback"}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label="Hide live feedback"
            title="Slide away"
            style={{
              marginLeft: "auto",
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              background: "transparent",
              color: COLORS.muted,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ›
          </button>
        </div>

        {/* The body scrolls, the header does not. Without an explicit
            scroll container and touch-action, content past the fold on a
            tablet was simply unreachable: a button could be half off the
            panel with no way to get to it. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            padding: 14,
          }}
        >
          {mode === "chemistry" ? (
            <ChemistryPanel
              chemistry={chemistry}
              captureEnabled={captureEnabled}
              onCapture={onCapture}
              onProblemChange={onChemistryProblemChange}
            />
          ) : (
            <MathFeedbackPanel workflow={math} />
          )}
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 8,
            padding: "10px 14px",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <button
            type="button"
            onClick={onChemistryProblemChange}
            title="Clear the page and start the next question"
            style={{
              flex: 1,
              padding: "9px 12px",
              background: "transparent",
              color: COLORS.muted,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            New question
          </button>
          <button
            type="button"
            onClick={toggle}
            style={{
              padding: "9px 14px",
              background: accent,
              color: "#fff",
              border: "none",
              borderRadius: RADIUS.md,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to writing
          </button>
        </div>
      </aside>
    </>
  );
}
