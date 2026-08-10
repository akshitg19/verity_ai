import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_LINE_HEIGHT as LINE_HEIGHT,
  getStrokeRow,
  strokeTouchesPoint,
} from "./geometry";
import {
  addStrokeToInkIndex,
  buildInkIndex,
  expandAndClampBounds,
  getCanvasBackingSize,
  getStrokeBounds,
} from "./inkModel";

const NOTEBOOK_ROWS = 24;
const NOTEBOOK_HEIGHT = NOTEBOOK_ROWS * LINE_HEIGHT;
const TOOLBAR_HEIGHT = 72;
const FEEDBACK_PANEL_WIDTH = 360;
const PAGE_GAP = 16;
const NOOP = () => {};

function drawStroke(context, stroke) {
  const points = stroke.points;
  if (points.length === 0) return;

  const color = stroke.color ?? "#1f2926";
  const width = stroke.width ?? 4;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.stroke();
}

export default function useCanvas({
  canvasMode = "rows",
  verdictsByLine = new Map(),
  onRowReady = NOOP,
  onRowEdited = NOOP,
  onStructureStrokeStarted = NOOP,
  onStructureChanged = NOOP,
  onCleared = NOOP,
}) {
  const staticCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const canvasRef = useRef(null);
  const drawStaticFrameRef = useRef(() => {});
  const drawOverlayFrameRef = useRef(() => {});
  const overlayFrameRequestRef = useRef(null);
  const canvasSizeRef = useRef({ width: 0, height: 0, pixelRatio: 1 });

  const [strokes, setStrokes] = useState([]);
  const strokesRef = useRef([]);
  const inkIndexRef = useRef(buildInkIndex([]));
  const rowVersionsRef = useRef(new Map());
  const lastReadyVersionRef = useRef(new Map());
  const [activeTool, setActiveTool] = useState("pen");
  const [penColor, setPenColor] = useState("#1f2926");
  const [penWidth, setPenWidth] = useState(4);
  const [activeLineNumber, setActiveLineNumber] = useState(null);

  const currentStroke = useRef(null);
  const activeDrawnPointCountRef = useRef(0);
  const activePointerId = useRef(null);
  const activeCanvasRectRef = useRef(null);
  const activeRowRef = useRef(null);
  const rowToQueueAfterStrokeRef = useRef(null);
  const rowIdleTimerRef = useRef(null);

  const onRowReadyRef = useRef(onRowReady);
  const onRowEditedRef = useRef(onRowEdited);
  const onStructureStrokeStartedRef = useRef(onStructureStrokeStarted);
  const onStructureChangedRef = useRef(onStructureChanged);
  const onClearedRef = useRef(onCleared);
  useEffect(() => {
    onRowReadyRef.current = onRowReady;
  }, [onRowReady]);
  useEffect(() => {
    onRowEditedRef.current = onRowEdited;
  }, [onRowEdited]);
  useEffect(() => {
    onStructureStrokeStartedRef.current = onStructureStrokeStarted;
  }, [onStructureStrokeStarted]);
  useEffect(() => {
    onStructureChangedRef.current = onStructureChanged;
  }, [onStructureChanged]);
  useEffect(() => {
    onClearedRef.current = onCleared;
  }, [onCleared]);

  const isStructure = canvasMode === "structure";

  const getPoint = (event, rect = activeCanvasRectRef.current) => {
    const canvasRect = rect ?? canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top,
      t: event.timeStamp,
      p: event.pressure,
    };
  };

  const getLineNumberForRow = (row) => {
    const rows = [...inkIndexRef.current.rows.keys()].sort((a, b) => a - b);
    const index = rows.indexOf(row);
    return index === -1 ? null : index + 1;
  };

  const notifyRowReady = useCallback((row) => {
    if (row === null || row === undefined) return;
    const rowStrokes = inkIndexRef.current.rows.get(row);
    if (!rowStrokes?.length) return;

    const version = rowVersionsRef.current.get(row) ?? 0;
    if (lastReadyVersionRef.current.get(row) === version) return;
    lastReadyVersionRef.current.set(row, version);
    onRowReadyRef.current({
      row,
      strokes: [...rowStrokes],
      version,
    });
  }, []);

  const bumpRowVersion = (row) => {
    const nextVersion = (rowVersionsRef.current.get(row) ?? 0) + 1;
    rowVersionsRef.current.set(row, nextVersion);
    return nextVersion;
  };

  const notifyRowEdited = (row) => {
    if (row === null || row === undefined) return;
    bumpRowVersion(row);
    onRowEditedRef.current(row, inkIndexRef.current.rows.has(row));
  };

  const handlePointerDown = (event) => {
    if (activeTool === "scroll") return;
    if (event.pointerType === "touch") {
      event.preventDefault();
      return;
    }
    if (activePointerId.current !== null) return;

    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
    }

    const canvasRect = canvasRef.current.getBoundingClientRect();
    activeCanvasRectRef.current = canvasRect;
    const firstPoint = getPoint(event, canvasRect);

    if (activeTool === "eraser") {
      const currentStrokes = strokesRef.current;
      const strokeIndex = currentStrokes.findLastIndex((stroke) =>
        strokeTouchesPoint(stroke, firstPoint)
      );
      if (strokeIndex === -1) return;

      const removedStroke = currentStrokes[strokeIndex];
      const updatedStrokes = currentStrokes.filter(
        (_, index) => index !== strokeIndex
      );
      strokesRef.current = updatedStrokes;
      inkIndexRef.current = buildInkIndex(updatedStrokes);
      startTransition(() => setStrokes(updatedStrokes));
      drawStaticFrameRef.current();
      drawOverlayFrameRef.current();

      const row = getStrokeRow(removedStroke);
      if (isStructure) onStructureChangedRef.current();
      else notifyRowEdited(row);
      return;
    }

    if (isStructure) {
      onStructureStrokeStartedRef.current();
    } else {
      const newRow = Math.floor(firstPoint.y / LINE_HEIGHT);
      const previousRow = activeRowRef.current;
      if (previousRow !== null && newRow > previousRow) {
        rowToQueueAfterStrokeRef.current = previousRow;
      }
      notifyRowEdited(newRow);
      activeRowRef.current = newRow;
      setActiveLineNumber(getLineNumberForRow(newRow));
    }

    activePointerId.current = event.pointerId;
    canvasRef.current.setPointerCapture(event.pointerId);
    currentStroke.current = {
      points: [firstPoint],
      pointerType: event.pointerType,
      color: penColor,
      width: penWidth,
    };
    activeDrawnPointCountRef.current = 0;
    drawActiveStrokeSegment();
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      return;
    }
    if (event.pointerType === "pen") event.preventDefault();
    if (
      !currentStroke.current ||
      event.pointerId !== activePointerId.current
    ) {
      return;
    }

    const events = event.getCoalescedEvents
      ? event.getCoalescedEvents()
      : [event];
    for (const pointEvent of events) {
      currentStroke.current.points.push(getPoint(pointEvent));
    }
    drawActiveStrokeSegment();
  };

  const handlePointerUp = (event) => {
    if (event.pointerType === "touch") return;
    if (
      !currentStroke.current ||
      event.pointerId !== activePointerId.current
    ) {
      return;
    }

    const finalPoint = getPoint(event);
    const points = currentStroke.current.points;
    const lastPoint = points[points.length - 1];
    if (!lastPoint || finalPoint.x !== lastPoint.x || finalPoint.y !== lastPoint.y) {
      points.push(finalPoint);
      drawActiveStrokeSegment();
    }

    const finished = currentStroke.current;
    const staticContext = staticCanvasRef.current?.getContext("2d");
    if (staticContext) drawStroke(staticContext, finished);
    clearActiveCanvas();

    currentStroke.current = null;
    activeDrawnPointCountRef.current = 0;
    activePointerId.current = null;
    activeCanvasRectRef.current = null;

    const updatedStrokes = [...strokesRef.current, finished];
    strokesRef.current = updatedStrokes;
    const row = addStrokeToInkIndex(inkIndexRef.current, finished);
    bumpRowVersion(row);

    if (isStructure) {
      startTransition(() => setStrokes(updatedStrokes));
      onStructureChangedRef.current();
      return;
    }

    activeRowRef.current = row;
    startTransition(() => {
      setActiveLineNumber(getLineNumberForRow(row));
      setStrokes(updatedStrokes);
    });

    const completedRow = rowToQueueAfterStrokeRef.current;
    rowToQueueAfterStrokeRef.current = null;
    if (completedRow !== null && completedRow !== row) {
      notifyRowReady(completedRow);
    }

    if (rowIdleTimerRef.current) clearTimeout(rowIdleTimerRef.current);
    rowIdleTimerRef.current = setTimeout(() => {
      notifyRowReady(row);
      rowIdleTimerRef.current = null;
    }, 1500);
  };

  const handlePointerCancel = (event) => {
    if (event.pointerId !== activePointerId.current) return;
    const canceledStroke = currentStroke.current;
    currentStroke.current = null;
    activeDrawnPointCountRef.current = 0;
    activePointerId.current = null;
    activeCanvasRectRef.current = null;
    rowToQueueAfterStrokeRef.current = null;
    clearActiveCanvas(canceledStroke);
  };

  const handleUndo = () => {
    const currentStrokes = strokesRef.current;
    if (currentStrokes.length === 0) return;

    const removedStroke = currentStrokes[currentStrokes.length - 1];
    const affectedRow = getStrokeRow(removedStroke);
    const updatedStrokes = currentStrokes.slice(0, -1);
    strokesRef.current = updatedStrokes;
    inkIndexRef.current = buildInkIndex(updatedStrokes);
    startTransition(() => setStrokes(updatedStrokes));
    drawStaticFrameRef.current();
    drawOverlayFrameRef.current();

    if (isStructure) onStructureChangedRef.current();
    else notifyRowEdited(affectedRow);
  };

  const clearPage = () => {
    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
    }
    strokesRef.current = [];
    inkIndexRef.current = buildInkIndex([]);
    rowVersionsRef.current.clear();
    lastReadyVersionRef.current.clear();
    currentStroke.current = null;
    activeDrawnPointCountRef.current = 0;
    activePointerId.current = null;
    activeCanvasRectRef.current = null;
    activeRowRef.current = null;
    rowToQueueAfterStrokeRef.current = null;
    setStrokes([]);
    setActiveLineNumber(null);
    clearActiveCanvas();
    drawStaticFrameRef.current();
    drawOverlayFrameRef.current();
    onClearedRef.current();
  };

  const loadStrokes = useCallback((storedStrokes) => {
    const nextStrokes = storedStrokes ?? [];
    if (rowIdleTimerRef.current) clearTimeout(rowIdleTimerRef.current);
    strokesRef.current = nextStrokes;
    inkIndexRef.current = buildInkIndex(nextStrokes);
    rowVersionsRef.current.clear();
    lastReadyVersionRef.current.clear();
    activeRowRef.current = null;
    setStrokes(nextStrokes);
    setActiveLineNumber(null);
    drawStaticFrameRef.current();
    drawOverlayFrameRef.current();
  }, []);

  const finishActiveRow = () => {
    if (isStructure) return;
    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
    }
    if (activeRowRef.current !== null) {
      notifyRowReady(activeRowRef.current);
      return;
    }
    for (const row of [...inkIndexRef.current.rows.keys()].sort((left, right) => left - right)) {
      notifyRowReady(row);
    }
  };

  const drawActiveStrokeSegment = useCallback(() => {
    const canvas = canvasRef.current;
    const stroke = currentStroke.current;
    if (!canvas || !stroke || stroke.points.length === 0) return;

    const context = canvas.getContext("2d");
    const points = stroke.points;
    const alreadyDrawn = activeDrawnPointCountRef.current;
    const color = stroke.color ?? "#1f2926";
    const width = stroke.width ?? 4;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (points.length === 1 && alreadyDrawn === 0) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
      context.fill();
      activeDrawnPointCountRef.current = 1;
      return;
    }

    const firstNewPoint = Math.max(1, alreadyDrawn);
    if (firstNewPoint >= points.length) return;
    context.beginPath();
    context.moveTo(points[firstNewPoint - 1].x, points[firstNewPoint - 1].y);
    for (let index = firstNewPoint; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.stroke();
    activeDrawnPointCountRef.current = points.length;
  }, []);

  const clearActiveCanvas = useCallback((stroke = currentStroke.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const { width, height } = canvasSizeRef.current;
    const dirtyRect = expandAndClampBounds(
      getStrokeBounds(stroke ?? { points: [] }),
      (stroke?.width ?? 4) + 2,
      width,
      height
    );
    if (dirtyRect) {
      context.clearRect(dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height);
      return;
    }
    context.clearRect(0, 0, width, height);
  }, []);

  const drawStaticFrame = useCallback(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const { width, height } = canvasSizeRef.current;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(120, 150, 190, 0.4)";
    context.lineWidth = 1;
    for (let y = LINE_HEIGHT; y < height; y += LINE_HEIGHT) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    for (const stroke of strokesRef.current) drawStroke(context, stroke);
  }, []);

  const drawOverlayFrame = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const { width, height } = canvasSizeRef.current;
    context.clearRect(0, 0, width, height);
    if (isStructure) return;

    const { rows, bounds } = inkIndexRef.current;
    const lineNumberByRow = new Map(
      [...rows.keys()]
        .sort((left, right) => left - right)
        .map((row, index) => [row, index + 1])
    );
    context.font = "11px sans-serif";
    for (const [row, rowBounds] of bounds) {
      const { minX, maxX, minY, maxY } = rowBounds;
      const verdict = verdictsByLine.get(row);
      const verdictStatus = verdict
        ? verdict.status ?? (verdict.valid ? "valid" : "invalid")
        : null;
      const color =
        verdictStatus === null
          ? "rgba(70, 130, 180, 0.8)"
          : verdictStatus === "valid"
          ? "rgba(40, 160, 90, 0.9)"
          : verdictStatus === "invalid"
          ? "rgba(200, 50, 50, 0.9)"
          : "rgba(180, 120, 30, 0.9)";
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = verdictStatus === "invalid" ? 2 : 1;
      context.strokeRect(minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12);
      context.fillText(`line ${lineNumberByRow.get(row)}`, minX - 6, minY - 10);
      if (verdictStatus === "invalid") {
        context.strokeStyle = "rgba(200, 50, 50, 0.9)";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(minX - 4, maxY + 10);
        context.lineTo(maxX + 4, maxY + 10);
        context.stroke();
      }
    }
  }, [isStructure, verdictsByLine]);

  const scheduleOverlayFrame = useCallback(() => {
    if (overlayFrameRequestRef.current !== null) return;
    overlayFrameRequestRef.current = requestAnimationFrame(() => {
      overlayFrameRequestRef.current = null;
      drawOverlayFrameRef.current();
    });
  }, []);

  useEffect(() => {
    drawStaticFrameRef.current = drawStaticFrame;
    drawStaticFrame();
  }, [drawStaticFrame]);

  useEffect(() => {
    drawOverlayFrameRef.current = drawOverlayFrame;
    scheduleOverlayFrame();
  }, [drawOverlayFrame, scheduleOverlayFrame]);

  useEffect(
    () => () => {
      if (overlayFrameRequestRef.current !== null) {
        cancelAnimationFrame(overlayFrameRequestRef.current);
      }
      if (rowIdleTimerRef.current) clearTimeout(rowIdleTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const staticCanvas = staticCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const activeCanvas = canvasRef.current;

    const resize = () => {
      const width = Math.max(
        640,
        document.documentElement.clientWidth -
          FEEDBACK_PANEL_WIDTH -
          PAGE_GAP * 3
      );
      const height = Math.max(NOTEBOOK_HEIGHT, window.innerHeight - TOOLBAR_HEIGHT);
      const backingSize = getCanvasBackingSize(
        width,
        height,
        window.devicePixelRatio
      );
      canvasSizeRef.current = { width, height, pixelRatio: backingSize.pixelRatio };

      for (const canvas of [staticCanvas, overlayCanvas, activeCanvas]) {
        canvas.width = backingSize.width;
        canvas.height = backingSize.height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas
          .getContext("2d")
          .setTransform(backingSize.pixelRatio, 0, 0, backingSize.pixelRatio, 0, 0);
      }
      drawStaticFrameRef.current();
      drawOverlayFrameRef.current();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return {
    staticCanvasRef,
    overlayCanvasRef,
    canvasRef,
    strokes,
    strokesRef,
    activeTool,
    setActiveTool,
    penColor,
    setPenColor,
    penWidth,
    setPenWidth,
    activeLineNumber,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleUndo,
    clearPage,
    loadStrokes,
    finishActiveRow,
    getStrokesSnapshot: () => strokesRef.current,
  };
}
