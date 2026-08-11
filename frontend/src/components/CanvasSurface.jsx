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
      {/* Anything anchored to ink -- the question prompt -- renders here so it
          can use canvas coordinates directly. */}
      {children}
    </div>
  );
}
