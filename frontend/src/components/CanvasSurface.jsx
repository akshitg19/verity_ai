import { COLORS, SURFACES } from "../theme";

export default function CanvasSurface({ canvas, children }) {
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
          // Always scrollable by finger. Touch never draws -- useCanvas
          // returns early for it -- so suppressing pan here only ever stopped
          // students moving down the page, which is what forced a separate
          // hand tool to exist. Stylus draws, finger scrolls, as in Samsung
          // Notes and iPad Notes.
          touchAction: "pan-y",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          display: "block",
          background: "transparent",
          cursor: activeTool === "eraser" ? "none" : "crosshair",
        }}
      />
      {/* Anything anchored to ink -- the question prompt -- renders here so it
          can use canvas coordinates directly. */}
      {children}
    </div>
  );
}
