import { useEffect, useRef } from "react";

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
  const surfaceRef = useRef(null);
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
    setViewportSize,
  } = canvas;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    const resize = (entry) => {
      const rect = entry?.contentRect ?? surface.getBoundingClientRect();
      setViewportSize(rect.width, rect.height);
    };
    resize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [setViewportSize]);

  return (
    <div
      ref={surfaceRef}
      className="canvas-surface"
      style={{
        position: "relative",
        width: "100%",
        minHeight: "calc(100dvh - 72px)",
        marginTop: 72,
      }}
    >
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
