import ChemistryPanel from "../chemistry/ChemistryPanel";
import { COLORS } from "../theme";
import MathFeedbackPanel from "./MathFeedbackPanel";

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
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 8,
            fontFamily: "monospace",
            maxWidth: "80vw",
            color: status.warning || status.notice ? "#a06a3a" : "#b00020",
            zIndex: 30,
          }}
        >
          {status.warning || status.notice ? "Notice" : "Error"}: {status.warning ?? status.notice ?? status.error}
        </div>
      )}
      <aside
        className="feedback-panel"
        aria-label="Live feedback"
        style={{
          position: "fixed",
          top: 88,
          right: 16,
          width: 360,
          maxHeight: "calc(100vh - 104px)",
          overflowY: "auto",
          zIndex: 15,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          boxShadow: "0 12px 30px rgba(31, 41, 38, 0.12)",
          padding: 16,
          boxSizing: "border-box",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>Live Feedback</div>
          <div style={{ padding: "5px 9px", borderRadius: 999, background: transcribing ? "#fff4d6" : COLORS.primaryLight, color: transcribing ? "#946200" : COLORS.primary, fontSize: 11, fontWeight: 700 }}>
            {transcribing ? "Reading…" : "Up to date"}
          </div>
        </div>
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
      </aside>
    </>
  );
}
