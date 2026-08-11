import { useCallback, useEffect, useRef, useState } from "react";

import { COLORS, RADIUS, SHADOW, SUBJECTS } from "../theme";
import Logo from "./Logo";
import PageStrip from "../notebook/PageStrip";

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

// From a fine tip for a subscript to a broad block for a whole line.
const ERASER_SIZES = [
  { label: "Fine", value: 6 },
  { label: "Small", value: 12 },
  { label: "Medium", value: 18 },
  { label: "Large", value: 30 },
  { label: "Block", value: 48 },
];

const THEME_LABELS = {
  system: { glyph: "◐", title: "Theme: following your device" },
  light: { glyph: "☀", title: "Theme: light" },
  dark: { glyph: "☾", title: "Theme: dark" },
};

// Anchors a popover to its trigger and keeps it on screen. Shared by the pen
// and eraser menus so the two cannot drift apart.
function useAnchoredMenu(triggerRef, open, { width, height }) {
  const [position, setPosition] = useState({ top: 80, left: 8 });

  const update = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - height - gap;
    const top =
      belowTop + height <= window.innerHeight - margin || rect.top < height
        ? belowTop
        : aboveTop;

    setPosition({
      top: Math.min(maxTop, Math.max(margin, top)),
      left: Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - width - margin)
      ),
    });
  }, [triggerRef, width, height]);

  useEffect(() => {
    if (!open) return undefined;
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  return position;
}

function ToolButton({ active, children, style, ...props }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        padding: "10px 16px",
        whiteSpace: "nowrap",
        background: active ? COLORS.primaryLight : COLORS.surface,
        color: active ? COLORS.primary : COLORS.text,
        border: active ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.md,
        fontWeight: active ? 700 : 500,
        fontFamily: "inherit",
        fontSize: 14,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

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
  theme,
  onFinishLine,
  onReadPage,
  onClear,
}) {
  const [showPenSettings, setShowPenSettings] = useState(false);
  const [showEraserSettings, setShowEraserSettings] = useState(false);
  const penSettingsRef = useRef(null);
  const eraserSettingsRef = useRef(null);
  const {
    activeTool,
    setActiveTool,
    penColor,
    setPenColor,
    penWidth,
    setPenWidth,
    eraserRadius,
    setEraserRadius,
    eraseMode,
    setEraseMode,
    strokes,
    activeLineNumber,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
  } = canvas;

  const penMenu = useAnchoredMenu(penSettingsRef, showPenSettings, {
    width: 250,
    height: 215,
  });
  const eraserMenu = useAnchoredMenu(eraserSettingsRef, showEraserSettings, {
    width: 250,
    height: 210,
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (penSettingsRef.current && !penSettingsRef.current.contains(event.target)) {
        setShowPenSettings(false);
      }
      if (
        eraserSettingsRef.current &&
        !eraserSettingsRef.current.contains(event.target)
      ) {
        setShowEraserSettings(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  const themeLabel = THEME_LABELS[theme.preference] ?? THEME_LABELS.system;
  const menuSurface = {
    position: "fixed",
    zIndex: 50,
    width: 250,
    padding: 16,
    boxSizing: "border-box",
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOW.float,
    fontFamily: "inherit",
  };
  const menuHeading = {
    marginBottom: 10,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: 700,
  };

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
        boxShadow: SHADOW.raised,
        overflowX: "auto",
        overflowY: "visible",
      }}
    >
      <button
        type="button"
        aria-label="Open notebook"
        aria-expanded={showNotebook}
        title="Notes and pages"
        onClick={onToggleNotebook}
        style={{
          width: 38,
          height: 38,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          background: showNotebook ? COLORS.primaryLight : COLORS.surface,
          color: showNotebook ? COLORS.primary : COLORS.text,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        ☰
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 150 }}>
        <Logo size={34} accent={SUBJECTS[mode].accent} />
        <div style={{ minWidth: 0 }}>
          <div
            title={notebook.activeNote.title}
            style={{
              color: COLORS.text,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: 1.15,
              fontFamily: "inherit",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 150,
            }}
          >
            {notebook.activeNote.title}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2, fontFamily: "inherit" }}>
            {SUBJECTS[mode].label}
          </div>
        </div>
      </div>

      <PageStrip notebook={notebook} mode={mode} />

      <div style={{ display: "flex", flexShrink: 0, padding: 3, gap: 2, borderRadius: RADIUS.md, background: COLORS.background, border: `1px solid ${COLORS.border}` }}>
        {[{ value: "math", label: "Math" }, { value: "chemistry", label: "Chemistry" }].map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onModeChange(option.value)}
              style={{
                padding: "7px 15px",
                background: selected ? COLORS.surface : "transparent",
                color: selected ? COLORS.primary : COLORS.muted,
                border: "none",
                borderRadius: RADIUS.sm,
                boxShadow: selected ? SHADOW.raised : "none",
                fontFamily: "inherit",
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
          aria-label="Optional typed math problem"
          type="text"
          value={problem}
          onChange={onProblemChange}
          onBlur={onProblemEditDone}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          placeholder="Optional: type the problem instead"
          style={{ flex: 1, minWidth: 180, maxWidth: 460, padding: "10px 14px", border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, background: COLORS.background, color: COLORS.text, fontFamily: "inherit", fontSize: 14, outline: "none" }}
        />
      ) : (
        <div style={{ flex: 1, minWidth: 180, maxWidth: 520, padding: "8px 14px", border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, background: COLORS.background, fontFamily: "inherit", overflow: "hidden" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: SUBJECTS.chemistry.accent }}>
            {chemistry.topic.label}
          </div>
          <div style={{ fontSize: 13, color: chemistry.ready ? COLORS.text : COLORS.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chemistry.ready
              ? chemistry.problemText
              : `${chemistry.problemType.label}. Write the question, or type it in the panel`}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        <div ref={penSettingsRef} style={{ position: "relative" }}>
          <div style={{ height: 40, display: "flex", alignItems: "stretch", border: activeTool === "pen" ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, background: activeTool === "pen" ? COLORS.primaryLight : COLORS.surface, overflow: "hidden", boxSizing: "border-box" }}>
            <button
              type="button"
              aria-pressed={activeTool === "pen"}
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
              aria-expanded={showPenSettings}
              onClick={() => { setActiveTool("pen"); setShowEraserSettings(false); setShowPenSettings((current) => !current); }}
              style={{ width: 32, padding: 0, display: "grid", placeItems: "center", background: showPenSettings ? "rgba(49, 94, 84, 0.1)" : "transparent", color: activeTool === "pen" ? COLORS.primary : COLORS.muted, border: "none", borderLeft: `1px solid ${COLORS.border}`, cursor: "pointer" }}
            >
              <span style={{ display: "inline-block", fontSize: 10, lineHeight: 1, transform: showPenSettings ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </button>
          </div>

          {showPenSettings && (
            <div style={{ ...menuSurface, top: penMenu.top, left: penMenu.left }}>
              <div style={menuHeading}>Thickness</div>
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
                      aria-pressed={selected}
                      onClick={() => { setPenWidth(option.value); setActiveTool("pen"); }}
                      style={{ flex: 1, height: 38, padding: 0, display: "grid", placeItems: "center", background: selected ? COLORS.primaryLight : COLORS.background, border: selected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: 9, cursor: "pointer" }}
                    >
                      <span style={{ width: previewSize, height: previewSize, borderRadius: "50%", background: penColor }} />
                    </button>
                  );
                })}
              </div>
              <div style={menuHeading}>Color</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                {PEN_COLORS.map((option) => {
                  const selected = penColor === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.label}
                      aria-label={`${option.label} pen color`}
                      aria-pressed={selected}
                      onClick={() => { setPenColor(option.value); setActiveTool("pen"); }}
                      style={{ width: 30, height: 30, flexShrink: 0, padding: 0, borderRadius: "50%", background: option.value, border: `3px solid ${COLORS.surface}`, boxShadow: selected ? `0 0 0 2px ${COLORS.primary}` : `0 0 0 1px ${COLORS.border}`, cursor: "pointer" }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div ref={eraserSettingsRef} style={{ position: "relative" }}>
          <div style={{ height: 40, display: "flex", alignItems: "stretch", border: activeTool === "eraser" ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, background: activeTool === "eraser" ? COLORS.primaryLight : COLORS.surface, overflow: "hidden", boxSizing: "border-box" }}>
            <button
              type="button"
              aria-pressed={activeTool === "eraser"}
              onClick={() => setActiveTool("eraser")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 13px", background: "transparent", color: activeTool === "eraser" ? COLORS.primary : COLORS.text, border: "none", fontWeight: activeTool === "eraser" ? 700 : 500, fontSize: 14, cursor: "pointer" }}
            >
              <span
                aria-hidden="true"
                style={{ width: Math.max(8, Math.min(eraserRadius / 2 + 5, 16)), height: Math.max(8, Math.min(eraserRadius / 2 + 5, 16)), flexShrink: 0, borderRadius: "50%", border: `2px solid ${activeTool === "eraser" ? COLORS.primary : COLORS.muted}` }}
              />
              <span>Eraser</span>
            </button>
            <button
              type="button"
              title="Eraser settings"
              aria-label="Open eraser settings"
              aria-expanded={showEraserSettings}
              onClick={() => { setActiveTool("eraser"); setShowPenSettings(false); setShowEraserSettings((current) => !current); }}
              style={{ width: 32, padding: 0, display: "grid", placeItems: "center", background: showEraserSettings ? "rgba(49, 94, 84, 0.1)" : "transparent", color: activeTool === "eraser" ? COLORS.primary : COLORS.muted, border: "none", borderLeft: `1px solid ${COLORS.border}`, cursor: "pointer" }}
            >
              <span style={{ display: "inline-block", fontSize: 10, lineHeight: 1, transform: showEraserSettings ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </button>
          </div>

          {showEraserSettings && (
            <div style={{ ...menuSurface, top: eraserMenu.top, left: eraserMenu.left }}>
              <div style={menuHeading}>Size</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
                {ERASER_SIZES.map((option) => {
                  const selected = eraserRadius === option.value;
                  const preview = Math.max(6, Math.min(option.value / 2 + 4, 22));
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.label}
                      aria-label={`${option.label} eraser`}
                      aria-pressed={selected}
                      onClick={() => { setEraserRadius(option.value); setActiveTool("eraser"); }}
                      style={{ flex: 1, height: 38, padding: 0, display: "grid", placeItems: "center", background: selected ? COLORS.primaryLight : COLORS.background, border: selected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: 9, cursor: "pointer" }}
                    >
                      <span style={{ width: preview, height: preview, borderRadius: "50%", border: `2px solid ${COLORS.muted}` }} />
                    </button>
                  );
                })}
              </div>
              <div style={menuHeading}>How it erases</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { id: "pixel", label: "Rub out", hint: "Erases only what the circle covers" },
                  { id: "stroke", label: "Whole stroke", hint: "Removes an entire stroke on touch" },
                ].map((option) => {
                  const selected = eraseMode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      title={option.hint}
                      aria-pressed={selected}
                      onClick={() => { setEraseMode(option.id); setActiveTool("eraser"); }}
                      style={{ flex: 1, padding: "9px 8px", background: selected ? COLORS.primaryLight : COLORS.background, color: selected ? COLORS.primary : COLORS.text, border: selected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`, borderRadius: 9, fontSize: 12, fontWeight: selected ? 700 : 500, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          title={`${themeLabel.title}. Tap to change`}
          aria-label={themeLabel.title}
          onClick={theme.cycle}
          style={{ width: 42, height: 40, padding: 0, display: "grid", placeItems: "center", background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, fontSize: 17, cursor: "pointer" }}
        >
          {themeLabel.glyph}
        </button>

        {mode === "math" ? (
          <button
            type="button"
            onClick={onFinishLine}
            disabled={strokes.length === 0 || activeLineNumber === null}
            style={{ padding: "10px 16px", whiteSpace: "nowrap", background: COLORS.primary, color: "#fff", border: "none", borderRadius: RADIUS.md, fontWeight: 600, opacity: strokes.length === 0 || activeLineNumber === null ? 0.4 : 1, cursor: strokes.length === 0 || activeLineNumber === null ? "not-allowed" : "pointer" }}
          >
            {activeLineNumber === null ? "Check Line" : `Check Line ${activeLineNumber}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={onReadPage}
            disabled={strokes.length === 0 || chemistry.reading}
            style={{ padding: "10px 16px", whiteSpace: "nowrap", background: SUBJECTS.chemistry.accent, color: "#fff", border: "none", borderRadius: RADIUS.md, fontWeight: 600, opacity: strokes.length === 0 || chemistry.reading ? 0.4 : 1, cursor: strokes.length === 0 || chemistry.reading ? "not-allowed" : "pointer" }}
          >
            {chemistry.reading ? "Reading…" : chemistry.isDrawing ? "Read Page" : "Read Rows"}
          </button>
        )}

        <ToolButton
          title="Undo"
          aria-label="Undo"
          onClick={handleUndo}
          disabled={!canUndo}
          style={{ padding: "10px 13px", opacity: canUndo ? 1 : 0.4, cursor: canUndo ? "pointer" : "not-allowed" }}
        >
          ↶
        </ToolButton>
        <ToolButton
          title="Redo"
          aria-label="Redo"
          onClick={handleRedo}
          disabled={!canRedo}
          style={{ padding: "10px 13px", opacity: canRedo ? 1 : 0.4, cursor: canRedo ? "pointer" : "not-allowed" }}
        >
          ↷
        </ToolButton>
        <ToolButton
          onClick={onClear}
          style={{ color: COLORS.danger }}
        >
          New Problem
        </ToolButton>
      </div>
    </div>
  );
}
