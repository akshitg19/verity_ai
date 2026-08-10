import { useEffect, useRef, useState } from "react";

import { COLORS, SUBJECTS } from "../theme";

const PEN_WIDTHS = [
  { label: "Extra thin", value: 1.5 },
  { label: "Thin", value: 2.5 },
  { label: "Medium", value: 4 },
  { label: "Thick", value: 6 },
  { label: "Extra thick", value: 9 },
];

const PEN_COLORS = [
  { label: "Black", value: "#1f2926" },
  { label: "Blue", value: "#315f8a" },
  { label: "Green", value: "#315e54" },
  { label: "Purple", value: "#75466f" },
  { label: "Red", value: "#a94a4a" },
];

export default function WorkspaceToolbar({
  notebook,
  showNotebook,
  onToggleNotebook,
  mode,
  onModeChange,
  chemistry,
  problem,
  onProblemChange,
  onProblemEditDone,
  canvas,
  onFinishLine,
  onReadPage,
  onClear,
}) {
  const [showPenSettings, setShowPenSettings] = useState(false);
  const penSettingsRef = useRef(null);
  const {
    activeTool,
    setActiveTool,
    penColor,
    setPenColor,
    penWidth,
    setPenWidth,
    strokes,
    activeLineNumber,
    handleUndo,
  } = canvas;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (penSettingsRef.current && !penSettingsRef.current.contains(event.target)) {
        setShowPenSettings(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        height: 72,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        boxSizing: "border-box",
        background: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)",
        overflowX: "auto",
        overflowY: "visible",
      }}
    >
      <button
        type="button"
        aria-label="Open notebook"
        title="Notes and pages"
        onClick={onToggleNotebook}
        style={{
          width: 38,
          height: 38,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          background: showNotebook ? COLORS.primaryLight : COLORS.surface,
          color: showNotebook ? COLORS.primary : COLORS.text,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        ☰
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 150 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: SUBJECTS[mode].accent,
            color: "#fff",
            fontWeight: 700,
            fontSize: 20,
            fontFamily: "sans-serif",
          }}
        >
          V
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            title={notebook.activeNote.title}
            style={{
              color: COLORS.text,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: 1.15,
              fontFamily: "sans-serif",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 150,
            }}
          >
            {notebook.activeNote.title}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2, fontFamily: "sans-serif" }}>
            Page {notebook.pageIndex + 1} of {notebook.pageCount}
            <button
              type="button"
              title="Add a page"
              onClick={notebook.addPage}
              style={{ marginLeft: 6, border: "none", background: "transparent", color: COLORS.primary, fontSize: 13, cursor: "pointer", padding: 0, lineHeight: 1 }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexShrink: 0, padding: 3, gap: 2, borderRadius: 10, background: COLORS.background, border: `1px solid ${COLORS.border}` }}>
        {[{ value: "math", label: "Math" }, { value: "chemistry", label: "Chemistry" }].map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onModeChange(option.value)}
              style={{
                padding: "7px 15px",
                background: selected ? COLORS.surface : "transparent",
                color: selected ? COLORS.primary : COLORS.muted,
                border: "none",
                borderRadius: 8,
                boxShadow: selected ? "0 1px 3px rgba(31, 41, 38, 0.14)" : "none",
                fontFamily: "sans-serif",
                fontSize: 13,
                fontWeight: selected ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {mode === "math" ? (
        <input
          type="text"
          value={problem}
          onChange={onProblemChange}
          onBlur={onProblemEditDone}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          placeholder="Optional: type the problem instead"
          style={{ flex: 1, minWidth: 180, maxWidth: 460, padding: "10px 14px", border: `1px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.background, color: COLORS.text, fontFamily: "sans-serif", fontSize: 14, outline: "none" }}
        />
      ) : (
        <div style={{ flex: 1, minWidth: 180, maxWidth: 520, padding: "8px 14px", border: `1px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.background, fontFamily: "sans-serif", overflow: "hidden" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: SUBJECTS.chemistry.accent }}>
            {chemistry.topic.label}
          </div>
          <div style={{ fontSize: 13, color: chemistry.ready ? COLORS.text : COLORS.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chemistry.ready ? chemistry.problemText : `${chemistry.problemType.label} — fill in the question in the panel`}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        <div ref={penSettingsRef} style={{ position: "relative" }}>
          <div style={{ height: 40, display: "flex", alignItems: "stretch", border: activeTool === "pen" ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: 10, background: activeTool === "pen" ? COLORS.primaryLight : COLORS.surface, overflow: "hidden", boxSizing: "border-box" }}>
            <button
              type="button"
              onClick={() => setActiveTool("pen")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 13px", background: "transparent", color: activeTool === "pen" ? COLORS.primary : COLORS.text, border: "none", fontWeight: activeTool === "pen" ? 700 : 500, fontSize: 14, cursor: "pointer" }}
            >
              <span style={{ width: Math.max(7, Math.min(penWidth + 4, 14)), height: Math.max(7, Math.min(penWidth + 4, 14)), flexShrink: 0, borderRadius: "50%", background: penColor, boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.12)" }} />
              <span>Pen</span>
            </button>
            <button
              type="button"
              title="Pen settings"
              aria-label="Open pen settings"
              onClick={() => { setActiveTool("pen"); setShowPenSettings((current) => !current); }}
              style={{ width: 32, padding: 0, display: "grid", placeItems: "center", background: showPenSettings ? "rgba(49, 94, 84, 0.1)" : "transparent", color: activeTool === "pen" ? COLORS.primary : COLORS.muted, border: "none", borderLeft: `1px solid ${COLORS.border}`, cursor: "pointer" }}
            >
              <span style={{ display: "inline-block", fontSize: 10, lineHeight: 1, transform: showPenSettings ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </button>
          </div>

          {showPenSettings && (
            <div style={{ position: "absolute", top: 48, left: 0, zIndex: 50, width: 250, padding: 16, boxSizing: "border-box", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: "0 12px 30px rgba(31, 41, 38, 0.16)", fontFamily: "sans-serif" }}>
              <div style={{ marginBottom: 10, color: COLORS.text, fontSize: 13, fontWeight: 700 }}>Thickness</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
                {PEN_WIDTHS.map((option) => {
                  const selected = penWidth === option.value;
                  const previewSize = Math.max(5, Math.min(option.value + 3, 13));
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.label}
                      aria-label={`${option.label} pen thickness`}
                      onClick={() => { setPenWidth(option.value); setActiveTool("pen"); }}
                      style={{ flex: 1, height: 38, padding: 0, display: "grid", placeItems: "center", background: selected ? COLORS.primaryLight : COLORS.background, border: selected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: 9, cursor: "pointer" }}
                    >
                      <span style={{ width: previewSize, height: previewSize, borderRadius: "50%", background: penColor }} />
                    </button>
                  );
                })}
              </div>
              <div style={{ marginBottom: 10, color: COLORS.text, fontSize: 13, fontWeight: 700 }}>Color</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                {PEN_COLORS.map((option) => {
                  const selected = penColor === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.label}
                      aria-label={`${option.label} pen color`}
                      onClick={() => { setPenColor(option.value); setActiveTool("pen"); }}
                      style={{ width: 30, height: 30, flexShrink: 0, padding: 0, borderRadius: "50%", background: option.value, border: `3px solid ${COLORS.surface}`, boxShadow: selected ? `0 0 0 2px ${COLORS.primary}` : `0 0 0 1px ${COLORS.border}`, cursor: "pointer" }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => { setActiveTool("eraser"); setShowPenSettings(false); }}
          style={{ padding: "10px 16px", whiteSpace: "nowrap", background: activeTool === "eraser" ? COLORS.primaryLight : COLORS.surface, color: activeTool === "eraser" ? COLORS.primary : COLORS.text, border: activeTool === "eraser" ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: 10, fontWeight: activeTool === "eraser" ? 700 : 500, cursor: "pointer" }}
        >
          Eraser
        </button>
        <button
          type="button"
          title="Scroll page"
          aria-label="Scroll page"
          onClick={() => { setActiveTool("scroll"); setShowPenSettings(false); }}
          style={{ width: 42, height: 40, padding: 0, display: "grid", placeItems: "center", background: activeTool === "scroll" ? COLORS.primaryLight : COLORS.surface, color: activeTool === "scroll" ? COLORS.primary : COLORS.text, border: activeTool === "scroll" ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 18, cursor: "pointer" }}
        >
          ✋
        </button>

        {mode === "math" ? (
          <button
            type="button"
            onClick={onFinishLine}
            disabled={strokes.length === 0 || activeLineNumber === null}
            style={{ padding: "10px 16px", whiteSpace: "nowrap", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, opacity: strokes.length === 0 || activeLineNumber === null ? 0.4 : 1, cursor: strokes.length === 0 || activeLineNumber === null ? "not-allowed" : "pointer" }}
          >
            {activeLineNumber === null ? "Check Line" : `Check Line ${activeLineNumber}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={onReadPage}
            disabled={strokes.length === 0 || chemistry.reading}
            style={{ padding: "10px 16px", whiteSpace: "nowrap", background: SUBJECTS.chemistry.accent, color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, opacity: strokes.length === 0 || chemistry.reading ? 0.4 : 1, cursor: strokes.length === 0 || chemistry.reading ? "not-allowed" : "pointer" }}
          >
            {chemistry.reading ? "Reading…" : chemistry.isDrawing ? "Read Page" : "Read Rows"}
          </button>
        )}

        <button
          type="button"
          onClick={handleUndo}
          disabled={strokes.length === 0}
          style={{ padding: "10px 16px", whiteSpace: "nowrap", background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 10, opacity: strokes.length === 0 ? 0.4 : 1, cursor: strokes.length === 0 ? "not-allowed" : "pointer" }}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onClear}
          style={{ padding: "10px 16px", whiteSpace: "nowrap", background: COLORS.surface, color: COLORS.danger, border: `1px solid ${COLORS.border}`, borderRadius: 10, cursor: "pointer" }}
        >
          New Problem
        </button>
      </div>
    </div>
  );
}
