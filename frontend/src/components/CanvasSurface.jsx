import { COLORS } from "../theme";

export default function CanvasSurface({ canvas }) {
  const {
    staticCanvasRef,
    overlayCanvasRef,
    canvasRef,
    activeTool,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = canvas;

  return (
    <div style={{ position: "relative", width: "fit-content", marginTop: 72 }}>
      <canvas
        ref={staticCanvasRef}
        aria-hidden="true"
        style={{
          display: "block",
          background: "#faf8f2",
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
        style={{
          position: "absolute",
          inset: 0,
          touchAction: activeTool === "scroll" ? "pan-y" : "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          display: "block",
          background: "transparent",
        }}
      />
    </div>
  );
}
