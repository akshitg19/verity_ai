import { COLORS, FONT, SURFACES } from "../theme";

// A blank page with nothing on it and nothing said is the least inviting
// screen in the app, and it is the first one a student sees. One line, in the
// margin where the first row will be, gone the moment they start writing.
function EmptyPageHint({ mode }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 34,
        left: 46,
        pointerEvents: "none",
        color: COLORS.muted,
        fontFamily: FONT.sans,
        fontSize: 15,
        opacity: 0.5,
      }}
    >
      {mode === "chemistry"
        ? "Write the question here, then your working below it."
        : "Write the problem here, then your working below it."}
    </div>
  );
}

export default function CanvasSurface({ canvas, mode, children }) {
  const {
    staticCanvasRef,
    overlayCanvasRef,
    canvasRef,
    activeTool,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    strokes,
  } = canvas;

  return (
    <div style={{ position: "relative", width: "fit-content", marginTop: 72 }}>
      <canvas
        ref={staticCanvasRef}
        aria-hidden="true"
        style={{
          display: "block",
          background: SURFACES.paper,
          borderRight: `1px solid ${COLORS.border}`,
        }}
      />
      <canvas
        ref={overlayCanvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
          pointerEvents: "none",
          background: "transparent",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-label="Handwriting canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        style={{
          position: "absolute",
          inset: 0,
          // Never relaxed. `touch-action` governs pen as well as touch, so
          // `pan-y` here handed the stylus to the browser as a pan gesture
          // and drawing stopped working. Finger scrolling is done in JS
          // instead -- see the touch branch in useCanvas.
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          display: "block",
          background: "transparent",
          cursor: activeTool === "eraser" ? "none" : "crosshair",
        }}
      />
      {strokes.length === 0 && <EmptyPageHint mode={mode} />}

      {/* Anything anchored to ink -- the question prompt -- renders here so it
          can use canvas coordinates directly. */}
      {children}
    </div>
  );
}
