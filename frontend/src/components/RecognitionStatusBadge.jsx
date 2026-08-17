import { COLORS, RADIUS } from "../theme";

function statusCopy(status) {
  if (status?.state === "reading") return "Reading…";
  if (status?.state === "success") {
    return Number.isFinite(status.latencyMs)
      ? `Recognized · ${status.latencyMs} ms`
      : "Recognized";
  }
  if (status?.state === "failure") return "Recognition failed";
  return "Ready";
}

export default function RecognitionStatusBadge({ mode, status }) {
  const source = mode === "chemistry" ? "gemini" : status?.source ?? "gemini";
  const inputMode = mode === "chemistry" ? "image" : status?.inputMode ?? "image";
  const isMyScript = source === "myscript";
  const state = mode === "chemistry"
    ? { state: "idle", source, inputMode, latencyMs: null }
    : status;

  return (
    <div
      className="recognition-status-badge"
      aria-live="polite"
      aria-label={`${isMyScript ? "MyScript Beta" : "Gemini"}, ${inputMode} recognition, ${statusCopy(state)}`}
      style={{
        minHeight: 44,
        display: "grid",
        alignContent: "center",
        gap: 2,
        padding: "5px 11px",
        border: `1px solid ${isMyScript ? "var(--v-math)" : COLORS.border}`,
        borderRadius: RADIUS.md,
        background: isMyScript ? "var(--v-math-light)" : COLORS.surface,
        color: COLORS.text,
        boxSizing: "border-box",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background:
              state?.state === "failure"
                ? "var(--v-invalid)"
                : state?.state === "reading"
                  ? "var(--v-unsupported)"
                  : "var(--v-valid)",
          }}
        />
        <strong style={{ fontSize: 12, lineHeight: 1.1 }}>
          {isMyScript ? "MyScript Beta" : "Gemini"}
        </strong>
      </div>
      <div style={{ fontSize: 10.5, color: COLORS.muted, lineHeight: 1.15 }}>
        {inputMode === "vector" ? "Vector recognition" : "Image recognition"}
        {" · "}
        {statusCopy(state)}
      </div>
    </div>
  );
}
