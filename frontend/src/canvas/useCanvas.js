import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_ERASER_RADIUS,
  DEFAULT_LINE_HEIGHT as LINE_HEIGHT,
  eraseFromStroke,
  samplePath,
  strokeTouchesPoint,
} from "./geometry";
import { readCanvasPalette } from "../theme";
import {
  addStrokeToInkIndex,
  buildInkIndex,
  expandAndClampBounds,
  findStrokeRow,
  getCanvasBackingSize,
  getStrokeBounds,
  resolveRowForBounds,
} from "./inkModel";

const NOTEBOOK_ROWS = 24;
const NOTEBOOK_HEIGHT = NOTEBOOK_ROWS * LINE_HEIGHT;
const TOOLBAR_HEIGHT = 72;
const FEEDBACK_PANEL_WIDTH = 360;
const PAGE_GAP = 16;
const COMPACT_BREAKPOINT = 700;
const NOOP = () => {};

// Deep enough that a student never hits the end of undo in one problem,
// shallow enough that a page of snapshots cannot grow without bound.
const MAX_HISTORY = 60;

// How far apart erase samples may be along a drag before the band it rubs out
// starts to show gaps.
const ERASE_SAMPLE_STEP = 6;

export function shouldAcknowledgeProcessedRow(
  activeRow,
  processedRow,
  currentVersion,
  processedVersion
) {
  return activeRow === processedRow && currentVersion === processedVersion;
}

export function shouldInvalidateCommittedRow(startRow, committedRow) {
  return startRow !== null && startRow !== committedRow;
}

export function completedRowAfterStroke(queuedRow, previousRow, committedRow) {
  if (queuedRow !== null) return queuedRow;
  return previousRow !== null && committedRow > previousRow ? previousRow : null;
}

export function getCanvasDisplaySize(viewportWidth, viewportHeight) {
  const compact = viewportWidth <= COMPACT_BREAKPOINT;
  const reservedWidth = compact ? 0 : FEEDBACK_PANEL_WIDTH + PAGE_GAP * 3;
  return {
    width: Math.max(compact ? 1 : 640, viewportWidth - reservedWidth),
    height: Math.max(NOTEBOOK_HEIGHT, viewportHeight - TOOLBAR_HEIGHT),
  };
}

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
  const [eraserRadius, setEraserRadius] = useState(DEFAULT_ERASER_RADIUS);
  // "pixel" rubs out what the disc covers; "stroke" removes a whole stroke on
  // touch, which is the old behaviour and still the quicker way to clear a
  // whole character. Samsung Notes offers both, so this does too.
  const [eraseMode, setEraseMode] = useState("pixel");
  const [activeLineNumber, setActiveLineNumber] = useState(null);

  // Undo is a stack of whole-page snapshots rather than "drop the last
  // stroke". A pixel eraser can split one stroke into two, or clear six at
  // once, and a single drag has to undo as a single action; the old
  // stroke-list model could not express either. Snapshots also make redo free.
  const historyRef = useRef({ past: [], future: [] });
  const [historyDepth, setHistoryDepth] = useState({ past: 0, future: 0 });
  const eraserRadiusRef = useRef(DEFAULT_ERASER_RADIUS);
  const erasingRef = useRef(false);
  const erasedRowsRef = useRef(new Set());
  const eraserCursorRef = useRef(null);
  const lastErasePointRef = useRef(null);

  useEffect(() => {
    eraserRadiusRef.current = eraserRadius;
  }, [eraserRadius]);

  const currentStroke = useRef(null);
  const activeDrawnPointCountRef = useRef(0);
  const activePointerId = useRef(null);
  const activeCanvasRectRef = useRef(null);
  const activeRowRef = useRef(null);
  const strokeStartRowRef = useRef(null);
  const strokePreviousRowRef = useRef(null);
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

  const reconcileActiveRow = (affectedRow) => {
    if (isStructure) return;
    const remainingRows = [...inkIndexRef.current.rows.keys()].sort(
      (left, right) => left - right
    );
    const nextActiveRow = inkIndexRef.current.rows.has(affectedRow)
      ? affectedRow
      : remainingRows[remainingRows.length - 1] ?? null;
    activeRowRef.current = nextActiveRow;
    setActiveLineNumber(
      nextActiveRow === null ? null : getLineNumberForRow(nextActiveRow)
    );
  };

  const acknowledgeProcessedRow = useCallback((row, version) => {
    if (
      !shouldAcknowledgeProcessedRow(
        activeRowRef.current,
        row,
        rowVersionsRef.current.get(row) ?? 0,
        version
      )
    ) {
      return;
    }
    activeRowRef.current = null;
    setActiveLineNumber(null);
  }, []);

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
      onProcessed: () => acknowledgeProcessedRow(row, version),
    });
  }, [acknowledgeProcessedRow]);

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

  const syncHistoryDepth = () => {
    setHistoryDepth({
      past: historyRef.current.past.length,
      future: historyRef.current.future.length,
    });
  };

  // Snapshot the page *before* an edit. Called once per gesture, so a whole
  // eraser drag undoes in one step rather than one step per split stroke.
  const pushHistory = () => {
    const history = historyRef.current;
    history.past.push(strokesRef.current);
    if (history.past.length > MAX_HISTORY) history.past.shift();
    history.future = [];
    syncHistoryDepth();
  };

  const applyStrokes = (nextStrokes) => {
    strokesRef.current = nextStrokes;
    inkIndexRef.current = buildInkIndex(nextStrokes);
    startTransition(() => setStrokes(nextStrokes));
    drawStaticFrameRef.current();
    drawOverlayFrameRef.current();
  };

  // Rub out along a run of points in one pass, so a fast drag costs one React
  // update and one redraw rather than one per sampled position.
  const eraseAlong = (centres) => {
    const radius = eraserRadiusRef.current;
    let working = strokesRef.current;
    let changed = false;

    for (const centre of centres) {
      // Rows the disc overlaps are the rows whose recognition is now stale.
      for (const [row, bounds] of inkIndexRef.current.bounds) {
        if (!bounds) continue;
        if (
          centre.x + radius >= bounds.minX &&
          centre.x - radius <= bounds.maxX &&
          centre.y + radius >= bounds.minY &&
          centre.y - radius <= bounds.maxY
        ) {
          erasedRowsRef.current.add(row);
        }
      }

      const next = [];
      let touched = false;
      for (const stroke of working) {
        const pieces = eraseFromStroke(stroke, centre, radius);
        // eraseFromStroke returns the original by identity when it misses.
        if (pieces.length === 1 && pieces[0] === stroke) {
          next.push(stroke);
          continue;
        }
        touched = true;
        next.push(...pieces);
      }
      if (touched) {
        working = next;
        changed = true;
      }
    }

    if (changed) applyStrokes(working);
    return changed;
  };

  const endEraseGesture = () => {
    if (!erasingRef.current) return;
    erasingRef.current = false;
    lastErasePointRef.current = null;
    eraserCursorRef.current = null;
    activeCanvasRectRef.current = null;
    const rows = [...erasedRowsRef.current];
    erasedRowsRef.current.clear();
    drawOverlayFrameRef.current();

    if (isStructure) {
      onStructureChangedRef.current();
      return;
    }
    for (const row of rows) notifyRowEdited(row);
    reconcileActiveRow(rows[rows.length - 1] ?? null);
  };

  const handlePointerDown = (event) => {
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
      activePointerId.current = event.pointerId;
      canvasRef.current.setPointerCapture(event.pointerId);
      erasingRef.current = true;
      erasedRowsRef.current.clear();
      lastErasePointRef.current = firstPoint;
      eraserCursorRef.current = firstPoint;
      pushHistory();

      if (eraseMode === "stroke") {
        // The old behaviour, kept as a second mode: one tap takes a whole
        // stroke, which is still the fastest way to remove a whole character.
        const currentStrokes = strokesRef.current;
        const strokeIndex = currentStrokes.findLastIndex((stroke) =>
          strokeTouchesPoint(stroke, firstPoint, eraserRadiusRef.current)
        );
        if (strokeIndex !== -1) {
          const removed = currentStrokes[strokeIndex];
          // Read the row off the index that still holds this stroke.
          // Recomputing it from the stroke alone would be wrong now that a
          // stroke can join a row its own vertical centre does not name.
          const row = findStrokeRow(inkIndexRef.current, removed);
          if (row !== null) erasedRowsRef.current.add(row);
          applyStrokes(currentStrokes.filter((_, index) => index !== strokeIndex));
        }
      } else {
        eraseAlong([firstPoint]);
      }
      drawOverlayFrameRef.current();
      return;
    }

    if (isStructure) {
      strokeStartRowRef.current = null;
      strokePreviousRowRef.current = null;
      onStructureStrokeStartedRef.current();
    } else {
      // Provisional, so the active-line indicator is right the instant the
      // pen lands. The authoritative assignment happens on pointer up, once
      // the stroke has a real bounding box; resolving against the same ink
      // here keeps the two from disagreeing about which line is being edited.
      const newRow = resolveRowForBounds(inkIndexRef.current, {
        minX: firstPoint.x,
        maxX: firstPoint.x,
        minY: firstPoint.y,
        maxY: firstPoint.y,
      });
      strokeStartRowRef.current = newRow;
      const previousRow = activeRowRef.current;
      strokePreviousRowRef.current = previousRow;
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
    // Touch never draws, so it must be left alone to scroll the page. The old
    // preventDefault here fought native scrolling, which is why a separate
    // hand tool had to exist at all.
    if (event.pointerType === "touch") return;

    if (erasingRef.current && event.pointerId === activePointerId.current) {
      event.preventDefault();
      const point = getPoint(event);
      eraserCursorRef.current = point;
      if (eraseMode === "pixel") {
        const from = lastErasePointRef.current ?? point;
        eraseAlong(samplePath(from, point, ERASE_SAMPLE_STEP));
      }
      lastErasePointRef.current = point;
      scheduleOverlayFrame();
      return;
    }

    // Hover preview. The canvas hides the system cursor in eraser mode, so
    // without this a mouse user sees nothing at all until they press.
    if (activeTool === "eraser" && !erasingRef.current) {
      eraserCursorRef.current = getPoint(event);
      scheduleOverlayFrame();
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

    if (erasingRef.current && event.pointerId === activePointerId.current) {
      if (canvasRef.current?.hasPointerCapture?.(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }
      activePointerId.current = null;
      endEraseGesture();
      return;
    }

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

    pushHistory();
    const updatedStrokes = [...strokesRef.current, finished];
    strokesRef.current = updatedStrokes;
    const row = addStrokeToInkIndex(inkIndexRef.current, finished);
    bumpRowVersion(row);
    const startRow = strokeStartRowRef.current;
    strokeStartRowRef.current = null;
    const previousRow = strokePreviousRowRef.current;
    strokePreviousRowRef.current = null;

    if (isStructure) {
      startTransition(() => setStrokes(updatedStrokes));
      onStructureChangedRef.current();
      return;
    }

    if (shouldInvalidateCommittedRow(startRow, row)) {
      onRowEditedRef.current(row, true);
    }

    activeRowRef.current = row;
    startTransition(() => {
      setActiveLineNumber(getLineNumberForRow(row));
      setStrokes(updatedStrokes);
    });

    const completedRow = completedRowAfterStroke(
      rowToQueueAfterStrokeRef.current,
      previousRow,
      row
    );
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

  // The eraser preview must not be left behind when the pointer leaves.
  const handlePointerLeave = () => {
    if (erasingRef.current || !eraserCursorRef.current) return;
    eraserCursorRef.current = null;
    scheduleOverlayFrame();
  };

  const handlePointerCancel = (event) => {
    if (event.pointerId !== activePointerId.current) return;
    if (erasingRef.current) {
      activePointerId.current = null;
      endEraseGesture();
      return;
    }
    const canceledStroke = currentStroke.current;
    currentStroke.current = null;
    activeDrawnPointCountRef.current = 0;
    activePointerId.current = null;
    activeCanvasRectRef.current = null;
    rowToQueueAfterStrokeRef.current = null;
    strokeStartRowRef.current = null;
    strokePreviousRowRef.current = null;
    clearActiveCanvas(canceledStroke);
  };

  // Undo and redo move whole-page snapshots between the two stacks. Which
  // rows changed is not tracked, so every row that exists on either side of
  // the move is invalidated -- recognition re-running once too often is
  // cheap, and a stale verdict pinned to ink that is no longer there is not.
  const restoreSnapshot = (from, to) => {
    if (from.length === 0) return;
    const rowsBefore = [...inkIndexRef.current.rows.keys()];
    to.push(strokesRef.current);
    applyStrokes(from.pop());
    syncHistoryDepth();

    if (isStructure) {
      onStructureChangedRef.current();
      return;
    }
    const affected = new Set([...rowsBefore, ...inkIndexRef.current.rows.keys()]);
    for (const row of affected) notifyRowEdited(row);
    reconcileActiveRow([...affected].sort((left, right) => left - right).pop() ?? null);
  };

  const handleUndo = () => {
    const history = historyRef.current;
    restoreSnapshot(history.past, history.future);
  };

  const handleRedo = () => {
    const history = historyRef.current;
    restoreSnapshot(history.future, history.past);
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
    historyRef.current = { past: [], future: [] };
    setHistoryDepth({ past: 0, future: 0 });
    erasingRef.current = false;
    erasedRowsRef.current.clear();
    eraserCursorRef.current = null;
    lastErasePointRef.current = null;
    currentStroke.current = null;
    activeDrawnPointCountRef.current = 0;
    activePointerId.current = null;
    activeCanvasRectRef.current = null;
    activeRowRef.current = null;
    strokeStartRowRef.current = null;
    strokePreviousRowRef.current = null;
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
    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
    }
    const pointerId = activePointerId.current;
    if (
      pointerId !== null &&
      canvasRef.current?.hasPointerCapture?.(pointerId)
    ) {
      canvasRef.current.releasePointerCapture(pointerId);
    }
    strokesRef.current = nextStrokes;
    inkIndexRef.current = buildInkIndex(nextStrokes);
    rowVersionsRef.current.clear();
    lastReadyVersionRef.current.clear();
    historyRef.current = { past: [], future: [] };
    setHistoryDepth({ past: 0, future: 0 });
    erasingRef.current = false;
    erasedRowsRef.current.clear();
    eraserCursorRef.current = null;
    lastErasePointRef.current = null;
    currentStroke.current = null;
    activeDrawnPointCountRef.current = 0;
    activePointerId.current = null;
    activeCanvasRectRef.current = null;
    activeRowRef.current = null;
    strokeStartRowRef.current = null;
    strokePreviousRowRef.current = null;
    rowToQueueAfterStrokeRef.current = null;
    setStrokes(nextStrokes);
    setActiveLineNumber(null);
    const { width, height } = canvasSizeRef.current;
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, width, height);
    drawStaticFrameRef.current();
    drawOverlayFrameRef.current();
  }, []);

  const finishActiveRow = () => {
    if (isStructure) return;
    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
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
    // A 2D context cannot resolve var(), so the palette is read back from the
    // root element. index.css stays the one place a colour is defined.
    const palette = readCanvasPalette();
    context.clearRect(0, 0, width, height);
    context.fillStyle = palette.paper;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = palette.rule;
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

    // The eraser is drawn at its true radius so it can be aimed. Drawn before
    // the early return below, because a structure canvas is erased too.
    const cursor = eraserCursorRef.current;
    if (cursor) {
      context.beginPath();
      context.arc(cursor.x, cursor.y, eraserRadiusRef.current, 0, Math.PI * 2);
      context.fillStyle = "rgba(120, 130, 128, 0.18)";
      context.fill();
      context.strokeStyle = "rgba(60, 70, 68, 0.75)";
      context.lineWidth = 1.5;
      context.stroke();
    }

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

  // The canvas paints paper and ruling with resolved colours, so unlike every
  // CSS surface it does not follow a theme change on its own. Watching the
  // attribute the theme is stamped on keeps it in step without useCanvas
  // needing to know that a theme hook exists.
  useEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root || typeof MutationObserver === "undefined") return undefined;
    const observer = new MutationObserver(() => {
      drawStaticFrameRef.current();
      drawOverlayFrameRef.current();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const staticCanvas = staticCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const activeCanvas = canvasRef.current;

    const resize = () => {
      const { width, height } = getCanvasDisplaySize(
        document.documentElement.clientWidth,
        window.innerHeight
      );
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
    eraserRadius,
    setEraserRadius,
    eraseMode,
    setEraseMode,
    activeLineNumber,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    handleUndo,
    handleRedo,
    canUndo: historyDepth.past > 0,
    canRedo: historyDepth.future > 0,
    clearPage,
    loadStrokes,
    finishActiveRow,
    getStrokesSnapshot: () => strokesRef.current,
    // Where a row's ink sits, so anything anchored to a line can be placed
    // against it. Read through `strokes` so callers re-render when ink moves.
    getRowBounds: (row) =>
      row === null || row === undefined
        ? null
        : inkIndexRef.current.bounds.get(row) ?? null,
  };
}
