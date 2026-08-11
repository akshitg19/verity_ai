import { useState } from "react";

import ChemistryPanel from "../chemistry/ChemistryPanel";
import { COLORS, RADIUS, SHADOW } from "../theme";
import MathFeedbackPanel from "./MathFeedbackPanel";

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

  const toggle = () => {
    setOpen((current) => {
      rememberPanelOpen(!current);
      return !current;
    });
  };

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
            maxWidth: "80vw",
            color: status.warning || status.notice ? "var(--v-unsupported)" : COLORS.danger,
            zIndex: 30,
          }}
        >
          {status.warning || status.notice ? "Notice" : "Error"}: {status.warning ?? status.notice ?? status.error}
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          title="Show live feedback"
          style={{
            position: "fixed",
            top: 88,
            right: 16,
            zIndex: 15,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: COLORS.surface,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.pill,
            boxShadow: SHADOW.float,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: transcribing ? "var(--v-unsupported)" : COLORS.primary,
            }}
          />
          Feedback
        </button>
      )}

      {open && (
        <aside
          className="feedback-panel"
          aria-label="Live feedback"
          style={{
            position: "fixed",
            top: 88,
            right: 16,
            width: 360,
            // dvh so the foot of the panel is never behind a tablet browser's
            // toolbar. See the note on .feedback-panel in index.css.
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
          }}
        >
          <div
            style={{
              flexShrink: 0,
              padding: "14px 16px 10px",
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.text }}>
                Live Feedback
              </div>
              <div
                style={{
                  padding: "4px 9px",
                  borderRadius: RADIUS.pill,
                  background: transcribing ? "var(--v-unsupported-bg)" : COLORS.primaryLight,
                  color: transcribing ? "var(--v-unsupported)" : COLORS.primary,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {transcribing ? "Reading…" : "Up to date"}
              </div>
              <button
                type="button"
                onClick={toggle}
                aria-expanded
                title="Hide while I write"
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
              padding: 16,
            }}
          >
            <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.4, marginBottom: 16 }}>
              {mode === "chemistry"
                ? chemistry.isDrawing
                  ? "Review the structure verity.ai read. You can correct the SMILES before checking it."
                  : "Review each chemistry row. Correct a transcription before checking the work."
                : "Review what verity.ai read. You can correct any misread handwriting before checking continues."}
            </div>

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
        </aside>
      )}
    </>
  );
}
