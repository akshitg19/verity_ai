import { startTransition, useRef, useState, useEffect, useCallback } from "react";
import {
  DEFAULT_LINE_HEIGHT as LINE_HEIGHT,
  getStrokeRow,
  strokeTouchesPoint,
} from "./canvas/geometry";
import {
  addStrokeToInkIndex,
  buildInkIndex,
  expandAndClampBounds,
  getCanvasBackingSize,
  getStrokeBounds,
} from "./canvas/inkModel";

const NOTEBOOK_ROWS = 24;
const NOTEBOOK_HEIGHT = NOTEBOOK_ROWS * LINE_HEIGHT;
const TOOLBAR_HEIGHT = 72;
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const LINE_PAD = 16;
const FEEDBACK_PANEL_WIDTH = 360;
const PAGE_GAP = 16;
const COLORS = {
  background: "#f7f6f2",
  surface: "#ffffff",
  primary: "#315e54",
  primaryLight: "#e4f0ed",
  text: "#1f2926",
  muted: "#6f7a76",
  border: "#d9dfdc",
  danger: "#c94b4b",
};

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

function getVerdictStatus(verdict) {
  if (!verdict) return null;
  // `status` is the API source of truth. Keep the fallback while older
  // backends are still in circulation during local development.
  return verdict.status ?? (verdict.valid ? "valid" : "invalid");
}

// Renders one detected line's strokes onto a fresh, tightly-cropped canvas --
// paper background + a single ruled line for context + ink only. Deliberately
// excludes the on-screen segmentation debug overlay (boxes/labels), which is
// for the writer's eyes only and previously leaked into exported PNGs when
// people screenshotted the canvas instead of using a real export path.
function canvasToPngDataUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The handwriting image could not be encoded."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("The handwriting image could not be read."));
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

async function renderLineToPng(lineStrokes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of lineStrokes) {
    for (const pt of s.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  const width = Math.max(1, Math.ceil(maxX - minX + LINE_PAD * 2));
  const height = Math.max(1, Math.ceil(maxY - minY + LINE_PAD * 2));
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const ctx = off.getContext("2d");

  ctx.fillStyle = "#faf8f2";
  ctx.fillRect(0, 0, width, height);

  // Same light-blue ruling used on the main canvas, positioned just below
  // the ink so the crop still looks like a line written on ruled paper.
  ctx.strokeStyle = "rgba(120, 150, 190, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - LINE_PAD / 2);
  ctx.lineTo(width, height - LINE_PAD / 2);
  ctx.stroke();

  ctx.strokeStyle = "#1a1a2e";
  ctx.fillStyle = "#1a1a2e";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of lineStrokes) {
    const pts = s.points;
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(
        pts[0].x - minX + LINE_PAD,
        pts[0].y - minY + LINE_PAD,
        ctx.lineWidth / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x - minX + LINE_PAD, pts[0].y - minY + LINE_PAD);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x - minX + LINE_PAD, pts[i].y - minY + LINE_PAD);
    }
    ctx.stroke();
  }

  return canvasToPngDataUrl(off);
}

export default function App() {
  const staticCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const canvasRef = useRef(null);
  const drawStaticFrameRef = useRef(() => {});
  const drawOverlayFrameRef = useRef(() => {});
  const overlayFrameRequestRef = useRef(null);
  const canvasSizeRef = useRef({ width: 0, height: 0, pixelRatio: 1 });
  const [strokes, setStrokes] = useState([]); // finished strokes
  const [activeTool, setActiveTool] = useState("pen");
  const currentStroke = useRef(null); // stroke in progress
  const activeDrawnPointCountRef = useRef(0);
  const activePointerId = useRef(null);
  const activeCanvasRectRef = useRef(null);
  const rowToQueueAfterStrokeRef = useRef(null);
  const transcriptionRequestId = useRef(0);
  const transcriptionAbortRef = useRef(null);
  const transcriptionRowRef = useRef(null);
  const rowQueueRef = useRef([]);
  const queueRunningRef = useRef(false);
  const rowIdleTimerRef = useRef(null);
  const dirtyRowsRef = useRef(new Set());
  const strokesRef = useRef([]);
  const inkIndexRef = useRef(buildInkIndex([]));
  const rowVersionsRef = useRef(new Map());
  const checkRequestId = useRef(0);
  const hintRequestId = useRef(0);
  const problemRef = useRef("");
  const linesRef = useRef([]);
  const activeRowRef = useRef(null);
  const penSettingsRef = useRef(null);
  const [rowTranscribing, setRowTranscribing] = useState(false);
  const [structureTranscribing, setStructureTranscribing] = useState(false);
  const transcribing = rowTranscribing || structureTranscribing;
  const [lastResult, setLastResult] = useState(null); // { error } | { warning }

  const [problem, setProblem] = useState("");
  // One entry per finished handwritten line:
  // { row, text, unreadable } -- text is editable in the side panel, so a
  // misread transcription is a one-second typed fix instead of a dead end.
  const [lines, setLines] = useState([]);
  const [activeLineNumber, setActiveLineNumber] = useState(null);
  const [verdictsByLine, setVerdictsByLine] = useState(new Map()); // row -> LineVerdict
  const [firstWrongLine, setFirstWrongLine] = useState(null);

  const [hintLevel, setHintLevel] = useState(0); // 0 = no hint requested yet
  const [hintText, setHintText] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);

  const [penColor, setPenColor] = useState("#1f2926");
  const [penWidth, setPenWidth] = useState(4);
  const [showPenSettings, setShowPenSettings] = useState(false);

  // Chemistry mode. A molecular structure is one 2D drawing rather than a
  // sequence of written lines, so it needs none of the row bookkeeping
  // above: one canvas, one PNG, one SMILES, one verdict.
  const [mode, setMode] = useState("math");
  const [targetSmiles, setTargetSmiles] = useState("");
  const [structureSmiles, setStructureSmiles] = useState("");
  const [structureRead, setStructureRead] = useState(false);
  const [structureUnreadable, setStructureUnreadable] = useState(false);
  const [structureVerdict, setStructureVerdict] = useState(null);
  const structureRequestId = useRef(0);

  const getPoint = (e, rect = activeCanvasRectRef.current) => {
    const canvasRect = rect ?? canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - canvasRect.left,
      y: e.clientY - canvasRect.top,
      t: e.timeStamp,
      p: e.pressure,
    };
  };

  const cancelTranscriptionForRow = (row) => {
    if (transcriptionRowRef.current !== row) return;

    ++transcriptionRequestId.current;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    transcriptionRowRef.current = null;
  };

  const bumpRowVersion = (row) => {
    const nextVersion = (rowVersionsRef.current.get(row) ?? 0) + 1;
    rowVersionsRef.current.set(row, nextVersion);
    return nextVersion;
  };

  const getLineNumberForRow = (row) => {
    const sortedRows = [...inkIndexRef.current.rows.keys()].sort(
      (a, b) => a - b
    );
    const index = sortedRows.indexOf(row);
    return index === -1 ? null : index + 1;
  };

  const handlePointerDown = (e) => {
    if (activeTool === "scroll") return;
    if (e.pointerType === "touch") {
      e.preventDefault();
      return; // palm rejection
    }
    if (activePointerId.current !== null) return;

    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
    }

    const canvasRect = canvasRef.current.getBoundingClientRect();
    activeCanvasRectRef.current = canvasRect;
    const firstPoint = getPoint(e, canvasRect);

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
      if (mode === "chemistry") {
        invalidateStructure();
      } else {
        invalidateEditedRow(getStrokeRow(removedStroke));
      }
      return;
    }

    if (mode === "chemistry") {
      // One drawing, no rows: skip the row tracking, queueing, and
      // per-row verdict invalidation the math flow needs.
      activePointerId.current = e.pointerId;
      // Invalidate request identities immediately, but leave React/UI work
      // until the stroke is committed so pen-down remains a pure ink path.
      ++structureRequestId.current;
      ++hintRequestId.current;
      canvasRef.current.setPointerCapture(e.pointerId);
      currentStroke.current = {
        points: [firstPoint],
        pointerType: e.pointerType,
        color: penColor,
        width: penWidth,
      };
      activeDrawnPointCountRef.current = 0;
      drawActiveStrokeSegment();
      return;
    }

    const newRow = Math.floor(firstPoint.y / LINE_HEIGHT);
    const previousRow = activeRowRef.current;

    const movedToLowerRow =
      previousRow !== null &&
      newRow > previousRow;

    if (movedToLowerRow) {
      // Queue the completed row only after this stroke is safely committed.
      // Starting PNG encoding here would put recognition in the pen-down path.
      rowToQueueAfterStrokeRef.current = previousRow;
    }

    activePointerId.current = e.pointerId;

    cancelTranscriptionForRow(newRow);
    rowQueueRef.current = rowQueueRef.current.filter(
      (entry) => entry.row !== newRow
    );

    // The written work changed, so existing verdicts and hints may be stale.
    // This does not cancel transcription running for a different row.
    ++checkRequestId.current;
    ++hintRequestId.current;

    canvasRef.current.setPointerCapture(e.pointerId);
    currentStroke.current = { 
      points: [firstPoint], 
      pointerType: e.pointerType,
      color: penColor,
      width: penWidth, 
    };
    activeDrawnPointCountRef.current = 0;
    drawActiveStrokeSegment();
  };

  const handlePointerMove = (e) => {
    if (e.pointerType === "touch") {
      e.preventDefault();
      return;
    }

    if (e.pointerType === "pen") {
      e.preventDefault();
    }

    if (
      !currentStroke.current ||
      e.pointerId !== activePointerId.current
    ) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      currentStroke.current.points.push(getPoint(ev));
    }
    drawActiveStrokeSegment();
  };

  const handlePointerUp = (e) => {
    if (e.pointerType === "touch") return;

    if (
      !currentStroke.current ||
      e.pointerId !== activePointerId.current
    ) return;
    const finalPoint = getPoint(e);
    const points = currentStroke.current.points;
    const lastPoint = points[points.length - 1];
    if (
      !lastPoint ||
      finalPoint.x !== lastPoint.x ||
      finalPoint.y !== lastPoint.y
    ) {
      points.push(finalPoint);
      drawActiveStrokeSegment();
    }

    const finished = currentStroke.current;

    // Paint the finished stroke on the static layer before clearing the live
    // layer, avoiding a blank frame while React commits it to state.
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

    if (mode === "chemistry") {
      // No auto-transcribe on pen idle: the student says when the drawing
      // is finished, because a molecule has no equivalent of a line ending.
      startTransition(() => {
        invalidateStructure();
        setStrokes(updatedStrokes);
      });
      return;
    }

    // This row's handwriting no longer matches its saved transcription.
    dirtyRowsRef.current.add(row);

    activeRowRef.current = row;
    startTransition(() => {
      setActiveLineNumber(getLineNumberForRow(row));
      setStrokes(updatedStrokes);
      setVerdictsByLine((currentVerdicts) =>
        new Map(
          [...currentVerdicts].filter(
            ([verdictRow]) => verdictRow < row
          )
        )
      );
      setFirstWrongLine(null);
      setHintLevel(0);
      setHintText(null);
      setHintLoading(false);
      setLastResult(null);
    });

    const completedRow = rowToQueueAfterStrokeRef.current;
    rowToQueueAfterStrokeRef.current = null;
    if (completedRow !== null && completedRow !== row) {
      queueRow(completedRow);
    }

    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
    }

    rowIdleTimerRef.current = setTimeout(() => {
      queueRow(row);
      rowIdleTimerRef.current = null;
    }, 1500);
  };

  const handlePointerCancel = (e) => {
    if (e.pointerId !== activePointerId.current) return;
    const canceledStroke = currentStroke.current;
    currentStroke.current = null;
    activeDrawnPointCountRef.current = 0;
    activePointerId.current = null;
    activeCanvasRectRef.current = null;
    rowToQueueAfterStrokeRef.current = null;
    clearActiveCanvas(canceledStroke);
  };

  const invalidateEditedRow = (row) => {
    // Only this row needs handwriting transcription again.
    dirtyRowsRef.current.add(row);
    bumpRowVersion(row);

    ++checkRequestId.current;
    ++hintRequestId.current;

    // Remove this row from the waiting queue so its newest version
    // can be queued again after the user finishes editing.
    rowQueueRef.current = rowQueueRef.current.filter(
      (entry) => entry.row !== row
    );

    // Cancel transcription only if this exact row is currently processing.
    cancelTranscriptionForRow(row);

    // Remove only this row's old transcription.
    const updatedLines = linesRef.current.filter(
      (line) => line.row !== row
    );

    linesRef.current = updatedLines;
    setLines(updatedLines);

    // Keep the edited row active when it still has ink. If undo/erase removed
    // its final stroke, fall back to the last remaining row instead of
    // leaving the Check Line control pointed at an empty row.
    const remainingRows = [...inkIndexRef.current.rows.keys()].sort(
      (a, b) => a - b
    );
    const nextActiveRow = inkIndexRef.current.rows.has(row)
      ? row
      : remainingRows[remainingRows.length - 1] ?? null;
    activeRowRef.current = nextActiveRow;
    setActiveLineNumber(
      nextActiveRow === null ? null : getLineNumberForRow(nextActiveRow)
    );

    // Keep verdicts above the edited row.
    // Verdicts for this row and everything below it are now stale.
    setVerdictsByLine((currentVerdicts) =>
      new Map(
        [...currentVerdicts].filter(
          ([verdictRow]) => verdictRow < row
        )
      )
    );

    setFirstWrongLine(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setLastResult(null);
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
    if (mode === "chemistry") {
      invalidateStructure();
    } else {
      invalidateEditedRow(affectedRow);
    }
  };

  // Re-judge the whole page. Free (pure SymPy server-side), so it runs on
  // every finished line and every manual correction.
  const recheck = async (
    lineArr, 
    problemText = problemRef.current,
    changedRow = null
  ) => {
    const requestId = ++checkRequestId.current;
    ++hintRequestId.current;

    // Any change to the work invalidates the current hint ladder.
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setVerdictsByLine((currentVerdicts) => {
      if (changedRow === null) {
        return new Map();
      }

      return new Map(
        [...currentVerdicts].filter(
          ([row]) => row < changedRow
        )
      );
    });
    setFirstWrongLine(null);
    setLastResult(null);

    const usableLines = [...lineArr]
      .sort((a, b) => a.row - b.row)
      .filter(
        (line) =>
          line.text.trim() &&
          line.text !== "UNREADABLE"
      );

    const typedProblem = problemText.trim();

    // When the textbox is blank, use the first handwritten row as the problem.
    // When the textbox has text, preserve the existing behavior and treat every
    // handwritten row as a solution step.
    const handwrittenProblem = typedProblem ? null : usableLines[0] ?? null;

    const effectiveProblem =
      typedProblem || handwrittenProblem?.text.trim() || "";

    const solutionLines = typedProblem
      ? usableLines
      : usableLines.slice(1);

    const judgeLines = solutionLines.map((line, index) => ({
      row: line.row,
      line_number: index + 1,
      latex: line.text,
    }));

    const stepList = judgeLines.map(({ line_number, latex }) => ({
      line_number,
      latex,
    }));

    const rowByLineNumber = new Map(
      judgeLines.map((line) => [line.line_number, line.row])
    );

    if (!effectiveProblem || stepList.length === 0) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: effectiveProblem, steps: stepList }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (requestId !== checkRequestId.current) return;

      const problemVerdict = data.verdicts.find((v) => v.line_number === 0);
      const problemError = data.problem_error ?? problemVerdict?.error_type;
      if (problemError) {
        setLastResult({
          warning:
            problemError === "unsupported"
              ? "This problem is outside the current one-variable linear scope."
              : "The problem could not be parsed. Check the format and try again.",
        });
        return;
      }

      const returnedVerdicts = new Map(
        data.verdicts
          .filter((verdict) => verdict.line_number > 0)
          .map((verdict) => [
            rowByLineNumber.get(verdict.line_number),
            verdict,
          ])
          .filter(([row]) => row !== undefined)
      );

      setVerdictsByLine((currentVerdicts) => {
        if (changedRow === null) {
          return returnedVerdicts;
        }

        // Preserve verdicts above the changed row.
        const mergedVerdicts = new Map(
          [...currentVerdicts].filter(
            ([row]) => row < changedRow
          )
        );

        // Replace verdicts for the changed row and every later row.
        for (const [row, verdict] of returnedVerdicts) {
          if (row >= changedRow) {
            mergedVerdicts.set(row, verdict);
          }
        }

        return mergedVerdicts;
      });
      setFirstWrongLine(
        data.first_wrong_line > 0 ? data.first_wrong_line : null
      );
    } catch (e) {
      if (requestId !== checkRequestId.current) return;
      setVerdictsByLine(new Map());
      setFirstWrongLine(null);
      setHintLevel(0);
      setHintText(null);
      setLastResult({ error: `Check failed: ${e.message}` });
    }
  };

  const handleProblemChange = (e) => {
    const nextProblem = e.target.value;
    problemRef.current = nextProblem;
    setProblem(nextProblem);

    // A verdict belongs to the exact problem text that was checked. Hide it
    // immediately while the student edits and invalidate any in-flight
    // check/hint responses so they cannot restore stale feedback.
    ++checkRequestId.current;
    ++hintRequestId.current;
    setVerdictsByLine(new Map());
    setFirstWrongLine(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setLastResult(null);
  };

  const handleProblemEditDone = () => {
    recheck(linesRef.current, problemRef.current);
  };

  const processRow = async (targetRow, targetVersion) => {
    // Yield once before any export work. Even an automatically queued row
    // must never extend the pointer event that happened to schedule it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    let requestId = null;
    try {
      if (rowVersionsRef.current.get(targetRow) !== targetVersion) return;

      const currentRowStrokes = inkIndexRef.current.rows.get(targetRow);
      if (!currentRowStrokes?.length) return;

      requestId = ++transcriptionRequestId.current;
      transcriptionRowRef.current = targetRow;

      // The snapshot stays immutable even if a later stroke replaces the
      // row's index entry while the asynchronous PNG encoder is running.
      const lineStrokes = [...currentRowStrokes];
      const dataUrl = await renderLineToPng(lineStrokes);
      if (
        requestId !== transcriptionRequestId.current ||
        rowVersionsRef.current.get(targetRow) !== targetVersion
      ) {
        return;
      }
      const imageBase64 = dataUrl.split(",")[1];

      setLastResult(null);

      const abortController = new AbortController();
      transcriptionAbortRef.current = abortController;
      const response = await fetch(`${API_BASE}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: abortController.signal,
        body: JSON.stringify({
          image_base64: imageBase64,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        throw new Error(
          body?.detail ||
            `${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // The request was canceled because this row was edited or cleared.
      if (
        requestId !== transcriptionRequestId.current ||
        rowVersionsRef.current.get(targetRow) !== targetVersion
      ) {
        return;
      }

      const newLines = [
        ...linesRef.current.filter(
          (line) => line.row !== targetRow
        ),
        {
          row: targetRow,
          text: data.unreadable ? "" : data.text,
          unreadable: data.unreadable,
        },
      ].sort((a, b) => a.row - b.row);

      linesRef.current = newLines;
      setLines(newLines);

      // This transcription now matches the current handwriting.
      dirtyRowsRef.current.delete(targetRow);

      if (activeRowRef.current === targetRow) {
        activeRowRef.current = null;
        setActiveLineNumber(null);
      }

      await recheck(
        newLines,
        problemRef.current,
        targetRow
      );
    } catch (error) {
      if (
        requestId !== null &&
        requestId !== transcriptionRequestId.current
      ) {
        return;
      }

      if (error.name === "AbortError") return;

      setLastResult({
        error: error.message,
      });
    } finally {
      if (transcriptionRowRef.current === targetRow) {
        transcriptionRowRef.current = null;
      }
      transcriptionAbortRef.current = null;
    }
  };

  const runRowQueue = async () => {
    if (queueRunningRef.current) {
      return;
    }

    queueRunningRef.current = true;

    try {
      while (rowQueueRef.current.length > 0) {
        const { row: targetRow, version: targetVersion } =
          rowQueueRef.current.shift();

        await processRow(targetRow, targetVersion);
      }
    } finally {
      queueRunningRef.current = false;
      transcriptionRowRef.current = null;
      setRowTranscribing(false);
    }
  };

  const queueRow = (targetRow) => {
    if (targetRow === null) {
      return;
    }

    const alreadyTranscribed = linesRef.current.some(
      (line) => line.row === targetRow
    );

    if (
      alreadyTranscribed &&
      !dirtyRowsRef.current.has(targetRow)
    ) {
      return;
    }

    if (!inkIndexRef.current.rows.has(targetRow)) {
      return;
    }

    const version = rowVersionsRef.current.get(targetRow) ?? 0;

    // Keep at most one queued snapshot per row, always the newest version.
    rowQueueRef.current = rowQueueRef.current.filter(
      (entry) => entry.row !== targetRow
    );
    rowQueueRef.current.push({ row: targetRow, version });

    // Start the queue without blocking handwriting input.
    startTransition(() => setRowTranscribing(true));
    void runRowQueue();
  };

  const handleFinishLine = () => {
    queueRow(activeRowRef.current);
  };

  // Manual correction in the side panel: update text, clear the unreadable
  // flag once the student has typed something, and re-judge.
  const handleLineEdit = (row, newText) => {
    cancelTranscriptionForRow(row);
    rowQueueRef.current = rowQueueRef.current.filter(
      (entry) => entry.row !== row
    );
    ++checkRequestId.current;
    ++hintRequestId.current;
    setVerdictsByLine((currentVerdicts) =>
      new Map(
        [...currentVerdicts].filter(
          ([verdictRow]) => verdictRow < row
        )
      )
    );
    setFirstWrongLine(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setLastResult(null);
    setLines((prev) => {
      const next = prev.map((l) =>
        l.row === row
          ? { ...l, text: newText, unreadable: l.unreadable && !newText.trim() }
          : l
      );
      linesRef.current = next;
      return next;
    });
  };

  const handleLineEditDone = (row) => {
    recheck(
      linesRef.current,
      problemRef.current,
      row
    );
  };

  // --- Chemistry mode -------------------------------------------------
  // Deliberately separate from the row-based math handlers above rather
  // than generalising them: the two flows share the canvas and the panel's
  // visual language, but nothing about their segmentation model.

  const invalidateStructure = () => {
    ++structureRequestId.current;
    ++hintRequestId.current;
    setStructureRead(false);
    setStructureSmiles("");
    setStructureUnreadable(false);
    setStructureVerdict(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setLastResult(null);
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;

    // Switching subject starts a clean page. Carrying algebra ink into a
    // structure drawing (or the reverse) would only produce nonsense for
    // whichever recogniser runs next.
    handleClear();
    invalidateStructure();
    setTargetSmiles("");
    setShowPenSettings(false);
    setMode(nextMode);
  };

  const handleTargetSmilesChange = (event) => {
    setTargetSmiles(event.target.value);
    ++structureRequestId.current;
    ++hintRequestId.current;
    setStructureVerdict(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setLastResult(null);
  };

  // The whole canvas is one drawing, so this crops to the bounding box of
  // every stroke on the page instead of one ruled row's worth.
  const handleReadStructure = async () => {
    const currentStrokes = strokesRef.current;
    if (currentStrokes.length === 0) return;

    const requestId = ++structureRequestId.current;
    setStructureTranscribing(true);
    setLastResult(null);
    setStructureVerdict(null);

    try {
      const dataUrl = await renderLineToPng(currentStrokes);
      if (requestId !== structureRequestId.current) return;
      const imageBase64 = dataUrl.split(",")[1];

      const response = await fetch(`${API_BASE}/chemistry/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageBase64 }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.detail || `${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      if (requestId !== structureRequestId.current) return;

      setStructureSmiles(data.smiles);
      setStructureUnreadable(data.unreadable);
      setStructureRead(true);
    } catch (error) {
      if (requestId !== structureRequestId.current) return;
      setLastResult({ error: error.message });
    } finally {
      setStructureTranscribing(false);
    }
  };

  const handleStructureEdit = (value) => {
    ++structureRequestId.current;
    ++hintRequestId.current;
    setStructureSmiles(value);
    setStructureUnreadable(structureUnreadable && !value.trim());
    setStructureVerdict(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
  };

  const handleCheckStructure = async () => {
    const submitted = structureSmiles.trim();
    const target = targetSmiles.trim();
    if (!submitted || !target) return;

    const requestId = ++structureRequestId.current;
    ++hintRequestId.current;
    setHintLevel(0);
    setHintText(null);
    setLastResult(null);

    try {
      const response = await fetch(`${API_BASE}/chemistry/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_smiles: target,
          steps: [{ line_number: 1, smiles: submitted }],
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.detail || `${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      if (requestId !== structureRequestId.current) return;

      if (data.problem_error) {
        setStructureVerdict(null);
        setLastResult({
          warning:
            data.problem_error === "unsupported"
              ? "That target structure is outside the currently supported scope."
              : "The target structure could not be read as valid SMILES.",
        });
        return;
      }

      setStructureVerdict(data.verdicts[0] ?? null);
    } catch (error) {
      if (requestId !== structureRequestId.current) return;
      setStructureVerdict(null);
      setLastResult({ error: `Check failed: ${error.message}` });
    }
  };

  const handleChemistryHint = async () => {
    if (getVerdictStatus(structureVerdict) !== "invalid" || hintLevel >= 3) {
      return;
    }

    const nextLevel = hintLevel + 1;
    const requestId = ++hintRequestId.current;

    setHintLoading(true);
    try {
      const response = await fetch(`${API_BASE}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_number: 1,
          error_type: structureVerdict?.error_type ?? null,
          level: nextLevel,
        }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (requestId !== hintRequestId.current) return;
      setHintLevel(data.level);
      setHintText(data.hint);
    } catch (error) {
      if (requestId !== hintRequestId.current) return;
      setHintText(`Error: ${error.message}`);
    } finally {
      if (requestId === hintRequestId.current) {
        setHintLoading(false);
      }
    }
  };

  const handleGetHint = async () => {
    if (firstWrongLine === null || hintLevel >= 3) return;
    const nextLevel = hintLevel + 1;
    const verdict = [...verdictsByLine.values()].find(
      (item) => item.line_number === firstWrongLine
    );
    if (getVerdictStatus(verdict) !== "invalid") return;
    const requestId = ++hintRequestId.current;

    setHintLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_number: firstWrongLine,
          error_type: verdict?.error_type ?? null,
          level: nextLevel,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (requestId !== hintRequestId.current) return;
      setHintLevel(data.level);
      setHintText(data.hint);
    } catch (e) {
      if (requestId !== hintRequestId.current) return;
      setHintText(`Error: ${e.message}`);
    } finally {
      if (requestId === hintRequestId.current) {
        setHintLoading(false);
      }
    }
  };

  const drawStroke = useCallback((ctx, stroke) => {
    const pts = stroke.points;
    if (pts.length === 0) return;

    const strokeColor = stroke.color ?? "#1f2926";
    const strokeWidth = stroke.width ?? 4;

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(
        pts[0].x,
        pts[0].y,
        strokeWidth / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }

    ctx.stroke();
  }, []);

  const clearActiveCanvas = useCallback((stroke = currentStroke.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvasSizeRef.current;
    const dirtyRect = expandAndClampBounds(
      getStrokeBounds(stroke ?? { points: [] }),
      (stroke?.width ?? 4) + 2,
      width,
      height
    );

    if (dirtyRect) {
      ctx.clearRect(
        dirtyRect.x,
        dirtyRect.y,
        dirtyRect.width,
        dirtyRect.height
      );
      return;
    }

    ctx.clearRect(0, 0, width, height);
  }, []);

  // Draw only the points received since the previous pointer event. The
  // completed page lives on a separate canvas and is never touched here.
  const drawActiveStrokeSegment = useCallback(() => {
    const canvas = canvasRef.current;
    const stroke = currentStroke.current;
    if (!canvas || !stroke || stroke.points.length === 0) return;

    const ctx = canvas.getContext("2d");
    const points = stroke.points;
    const alreadyDrawn = activeDrawnPointCountRef.current;
    const strokeColor = stroke.color ?? "#1f2926";
    const strokeWidth = stroke.width ?? 4;

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (points.length === 1 && alreadyDrawn === 0) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, strokeWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      activeDrawnPointCountRef.current = 1;
      return;
    }

    const firstNewPoint = Math.max(1, alreadyDrawn);
    if (firstNewPoint >= points.length) return;

    ctx.beginPath();
    ctx.moveTo(
      points[firstNewPoint - 1].x,
      points[firstNewPoint - 1].y
    );
    for (let index = firstNewPoint; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.stroke();
    activeDrawnPointCountRef.current = points.length;
  }, []);

  const drawStaticFrame = useCallback(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvasSizeRef.current;
    ctx.clearRect(0, 0, width, height);

    // Ruled lines.
    // Previously drawn in #000000 at lineWidth 3 -- darker and thicker than
    // the ink itself, which made Gemini read the printed ruling as part of
    // the handwriting (e.g. a "=" sign touching the rule line got
    // transcribed as "-" or "<="). Using a light, distinctly-blue tone plus
    // a thinner stroke keeps the ruling visually subordinate to the ink so
    // it reads as background paper, not content.
    // See backend/tests/transcription/failures.md for the failure cases.
    ctx.strokeStyle = "rgba(120, 150, 190, 0.4)";
    ctx.lineWidth = 1;
    for (let y = LINE_HEIGHT; y < height; y += LINE_HEIGHT) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Ink strokes -- kept dark/opaque so they stay visually dominant over
    // the lighter ruling drawn above.
    ctx.strokeStyle = "#1a1a2e";
    ctx.fillStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
  }, [drawStroke]);

  const drawOverlayFrame = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvasSizeRef.current;
    ctx.clearRect(0, 0, width, height);

    // A structure is one figure, so per-row feedback would be misleading.
    if (mode === "chemistry") return;

    const { rows, bounds } = inkIndexRef.current;
    const lineNumberByRow = new Map(
      [...rows.keys()]
        .sort((a, b) => a - b)
        .map((row, index) => [row, index + 1])
    );
    ctx.font = "11px sans-serif";
    for (const [row, rowBounds] of bounds) {
      const { minX, maxX, minY, maxY } = rowBounds;
      const verdict = verdictsByLine.get(row);
      const verdictStatus = getVerdictStatus(verdict);
      const color =
        verdictStatus === null
          ? "rgba(70, 130, 180, 0.8)"   // neutral blue -- not checked
          : verdictStatus === "valid"
          ? "rgba(40, 160, 90, 0.9)"    // green -- correct
          : verdictStatus === "invalid"
          ? "rgba(200, 50, 50, 0.9)"    // red -- incorrect
          : "rgba(180, 120, 30, 0.9)";  // amber -- unsupported/unparseable
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = verdictStatus === "invalid" ? 2 : 1;
      ctx.strokeRect(minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12);
      ctx.fillText(`line ${lineNumberByRow.get(row)}`, minX - 6, minY - 10);

      // The product's core visual: a flagged line gets a clear red
      // underline beneath the ink, like a teacher's mark.
      if (verdictStatus === "invalid") {
        ctx.strokeStyle = "rgba(200, 50, 50, 0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(minX - 4, maxY + 10);
        ctx.lineTo(maxX + 4, maxY + 10);
        ctx.stroke();
      }
    }
  }, [verdictsByLine, mode]);

  const scheduleOverlayFrame = useCallback(() => {
    if (overlayFrameRequestRef.current !== null) return;

    overlayFrameRequestRef.current = requestAnimationFrame(() => {
      overlayFrameRequestRef.current = null;
      drawOverlayFrameRef.current();
    });
  }, []);

  // State changes redraw the completed page without reallocating either
  // canvas. Reassigning canvas.width/height clears its backing store and was
  // the main pen-down/pen-up pause on iPad.
  useEffect(() => {
    drawStaticFrameRef.current = drawStaticFrame;
    drawStaticFrame();
  }, [drawStaticFrame]);

  useEffect(() => {
    drawOverlayFrameRef.current = drawOverlayFrame;
    scheduleOverlayFrame();
  }, [drawOverlayFrame, scheduleOverlayFrame]);

  useEffect(() => () => {
    if (overlayFrameRequestRef.current !== null) {
      cancelAnimationFrame(overlayFrameRequestRef.current);
    }
  }, []);

  // Size allocation only belongs to initial layout and real window resizes.
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
      const height = Math.max(
        NOTEBOOK_HEIGHT,
        window.innerHeight - TOOLBAR_HEIGHT
      );
      const backingSize = getCanvasBackingSize(
        width,
        height,
        window.devicePixelRatio
      );
      const { pixelRatio } = backingSize;

      canvasSizeRef.current = { width, height, pixelRatio };

      for (const canvas of [staticCanvas, overlayCanvas, activeCanvas]) {
        canvas.width = backingSize.width;
        canvas.height = backingSize.height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas
          .getContext("2d")
          .setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      }
      drawStaticFrameRef.current();
      drawOverlayFrameRef.current();
    };

    resize();
    window.addEventListener("resize", resize);

    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        penSettingsRef.current &&
        !penSettingsRef.current.contains(event.target)
      ) {
        setShowPenSettings(false);
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, []);

  const handleClear = () => {
    ++transcriptionRequestId.current;
    ++checkRequestId.current;
    ++hintRequestId.current;
    ++structureRequestId.current;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;

    setStructureRead(false);
    setStructureSmiles("");
    setStructureUnreadable(false);
    setStructureVerdict(null);

    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
    }

    rowQueueRef.current = [];
    dirtyRowsRef.current.clear();
    strokesRef.current = [];
    inkIndexRef.current = buildInkIndex([]);
    rowVersionsRef.current.clear();

    currentStroke.current = null;
    activeDrawnPointCountRef.current = 0;
    activePointerId.current = null;
    activeCanvasRectRef.current = null;
    rowToQueueAfterStrokeRef.current = null;
    transcriptionRowRef.current = null;
    activeRowRef.current = null;
    linesRef.current = [];

    setStrokes([]);
    setLines([]);
    setActiveLineNumber(null);
    setVerdictsByLine(new Map());
    setFirstWrongLine(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setRowTranscribing(false);
    setStructureTranscribing(false);
    setLastResult(null);
    clearActiveCanvas();
    drawStaticFrameRef.current();
    drawOverlayFrameRef.current();
  };

  const handwrittenProblemRow =
    !problem.trim()
      ? [...lines]
          .sort((a, b) => a.row - b.row)
          .find(
            (line) =>
              line.text.trim() &&
              line.text !== "UNREADABLE"
          )?.row ?? null
      : null;

  return (
    <div 
      style={{ 
        position: "fixed", 
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden", 
        background: "#faf8f2",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "fit-content",
          marginTop: TOOLBAR_HEIGHT,
        }}
      >
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
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 165,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              background: COLORS.primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 20,
              fontFamily: "sans-serif",
            }}
          >
            V
          </div>

          <div>
            <div
              style={{
                color: COLORS.text,
                fontWeight: 700,
                fontSize: 19,
                lineHeight: 1.1,
                fontFamily: "sans-serif",
              }}
            >
              verity.ai
            </div>

            <div
              style={{
                color: COLORS.muted,
                fontSize: 11,
                marginTop: 2,
                fontFamily: "sans-serif",
              }}
            >
              Think it through
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexShrink: 0,
            padding: 3,
            gap: 2,
            borderRadius: 10,
            background: COLORS.background,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          {[
            { value: "math", label: "Math" },
            { value: "chemistry", label: "Chemistry" },
          ].map((option) => {
            const selected = mode === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleModeChange(option.value)}
                style={{
                  padding: "7px 15px",
                  background: selected ? COLORS.surface : "transparent",
                  color: selected ? COLORS.primary : COLORS.muted,
                  border: "none",
                  borderRadius: 8,
                  boxShadow: selected
                    ? "0 1px 3px rgba(31, 41, 38, 0.14)"
                    : "none",
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
            onChange={handleProblemChange}
            onBlur={handleProblemEditDone}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            placeholder="Optional: type the problem instead"
            style={{
              flex: 1,
              minWidth: 180,
              maxWidth: 460,
              padding: "10px 14px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              background: COLORS.background,
              color: COLORS.text,
              fontFamily: "sans-serif",
              fontSize: 14,
              outline: "none",
            }}
          />
        ) : (
          <input
            type="text"
            value={targetSmiles}
            onChange={handleTargetSmilesChange}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            placeholder="Target structure as SMILES, e.g. CC(=O)OC"
            style={{
              flex: 1,
              minWidth: 180,
              maxWidth: 460,
              padding: "10px 14px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              background: COLORS.background,
              color: COLORS.text,
              fontFamily: "monospace",
              fontSize: 14,
              outline: "none",
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginLeft: "auto",
          }}
        >
          <div
          ref={penSettingsRef} 
          style={{ position: "relative" }}
          >
            <div
              style={{
                height: 40,
                display: "flex",
                alignItems: "stretch",
                border:
                  activeTool === "pen"
                    ? `2px solid ${COLORS.primary}`
                    : `1px solid ${COLORS.border}`,
                borderRadius: 10,
                background:
                  activeTool === "pen"
                    ? COLORS.primaryLight
                    : COLORS.surface,
                overflow: "hidden",
                boxSizing: "border-box",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTool("pen")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 13px",
                  background: "transparent",
                  color:
                    activeTool === "pen"
                      ? COLORS.primary
                      : COLORS.text,
                  border: "none",
                  fontWeight: activeTool === "pen" ? 700 : 500,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: Math.max(7, Math.min(penWidth + 4, 14)),
                    height: Math.max(7, Math.min(penWidth + 4, 14)),
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: penColor,
                    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.12)",
                    transition: "width 0.15s ease, height 0.15s ease",
                  }}
                />

                <span>Pen</span>
              </button>

              <button
                type="button"
                title="Pen settings"
                aria-label="Open pen settings"
                onClick={() => {
                  setActiveTool("pen");
                  setShowPenSettings((current) => !current);
                }}
                style={{
                  width: 32,
                  padding: 0,
                  display: "grid",
                  placeItems: "center",
                  background: showPenSettings
                    ? "rgba(49, 94, 84, 0.1)"
                    : "transparent",
                  color:
                    activeTool === "pen"
                      ? COLORS.primary
                      : COLORS.muted,
                  border: "none",
                  borderLeft: `1px solid ${COLORS.border}`,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    lineHeight: 1,
                    transform: showPenSettings
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.15s ease",
                  }}
                >
                  ▼
                </span>
              </button>
            </div>

            {showPenSettings && (
              <div
                style={{
                  position: "absolute",
                  top: 48,
                  left: 0,
                  zIndex: 50,
                  width: 250,
                  padding: 16,
                  boxSizing: "border-box",
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 14,
                  boxShadow: "0 12px 30px rgba(31, 41, 38, 0.16)",
                  fontFamily: "sans-serif",
                }}
              >
                <div
                  style={{
                    marginBottom: 10,
                    color: COLORS.text,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Thickness
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginBottom: 18,
                  }}
                >
                  {PEN_WIDTHS.map((option) => {
                    const selected = penWidth === option.value;
                    const previewSize = Math.max(
                      5,
                      Math.min(option.value + 3, 13)
                    );

                    return (
                      <button
                        key={option.value}
                        type="button"
                        title={option.label}
                        aria-label={`${option.label} pen thickness`}
                        onClick={() => {
                          setPenWidth(option.value);
                          setActiveTool("pen");
                        }}
                        style={{
                          flex: 1,
                          height: 38,
                          padding: 0,
                          display: "grid",
                          placeItems: "center",
                          background: selected
                            ? COLORS.primaryLight
                            : COLORS.background,
                          border: selected
                            ? `2px solid ${COLORS.primary}`
                            : `1px solid ${COLORS.border}`,
                          borderRadius: 9,
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            width: previewSize,
                            height: previewSize,
                            borderRadius: "50%",
                            background: penColor,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    marginBottom: 10,
                    color: COLORS.text,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Color
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  {PEN_COLORS.map((option) => {
                    const selected = penColor === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        title={option.label}
                        aria-label={`${option.label} pen color`}
                        onClick={() => {
                          setPenColor(option.value);
                          setActiveTool("pen");
                        }}
                        style={{
                          width: 30,
                          height: 30,
                          flexShrink: 0,
                          padding: 0,
                          borderRadius: "50%",
                          background: option.value,
                          border: `3px solid ${COLORS.surface}`,
                          boxShadow: selected
                            ? `0 0 0 2px ${COLORS.primary}`
                            : `0 0 0 1px ${COLORS.border}`,
                          cursor: "pointer",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setActiveTool("eraser");
              setShowPenSettings(false);
            }}
            style={{
              padding: "10px 16px",
              whiteSpace: "nowrap",
              background:
                activeTool === "eraser"
                  ? COLORS.primaryLight
                  : COLORS.surface,
              color:
                activeTool === "eraser"
                  ? COLORS.primary
                  : COLORS.text,
              border:
                activeTool === "eraser"
                  ? `2px solid ${COLORS.primary}`
                  : `1px solid ${COLORS.border}`,
              borderRadius: 10,
              fontWeight: activeTool === "eraser" ? 700 : 500,
              cursor: "pointer",
            }}
          >
            Eraser
          </button>

          <button
            type="button"
            title="Scroll page"
            aria-label="Scroll page"
            onClick={() => {
              setActiveTool("scroll");
              setShowPenSettings(false);
            }}
            style={{
              width: 42,
              height: 40,
              padding: 0,
              display: "grid",
              placeItems: "center",
              background:
                activeTool === "scroll"
                  ? COLORS.primaryLight
                  : COLORS.surface,
              color:
                activeTool === "scroll"
                  ? COLORS.primary
                  : COLORS.text,
              border:
                activeTool === "scroll"
                  ? `2px solid ${COLORS.primary}`
                  : `1px solid ${COLORS.border}`,
              borderRadius: 10,
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ✋
          </button>

          {mode === "math" ? (
            <button
              onClick={handleFinishLine}
              disabled={
                strokes.length === 0 ||
                activeLineNumber === null
              }
              style={{
                padding: "10px 16px",
                whiteSpace: "nowrap",
                background: COLORS.primary,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 600,
                opacity:
                  strokes.length === 0 ||
                  activeLineNumber === null
                    ? 0.4
                    : 1,
                cursor:
                  strokes.length === 0 ||
                  activeLineNumber === null
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {activeLineNumber === null
                ? "Check Line"
                : `Check Line ${activeLineNumber}`}
            </button>
          ) : (
            <button
              onClick={handleReadStructure}
              disabled={strokes.length === 0 || transcribing}
              style={{
                padding: "10px 16px",
                whiteSpace: "nowrap",
                background: COLORS.primary,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 600,
                opacity:
                  strokes.length === 0 || transcribing ? 0.4 : 1,
                cursor:
                  strokes.length === 0 || transcribing
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {transcribing ? "Reading…" : "Read Structure"}
            </button>
          )}

          <button
            onClick={handleUndo}
            disabled={strokes.length === 0}
            style={{
              padding: "10px 16px",
              whiteSpace: "nowrap",
              background: COLORS.surface,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              opacity:
                strokes.length === 0 ? 0.4 : 1,
              cursor:
                strokes.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            Undo
          </button>

          <button
            onClick={handleClear}
            style={{
              padding: "10px 16px",
              whiteSpace: "nowrap",
              background: COLORS.surface,
              color: COLORS.danger,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            New Problem
          </button>
        </div>
      </div>

      {(lastResult?.error || lastResult?.warning) && (
        <div
          style={{
            position: "fixed", bottom: 12, left: 12, padding: "10px 16px",
            background: "#fff", border: "1px solid #ccc", borderRadius: 8,
            fontFamily: "monospace", maxWidth: "80vw",
            color: lastResult.warning ? "#a06a3a" : "#b00020",
          }}
        >
          {lastResult.warning ? "Notice" : "Error"}: {lastResult.warning ?? lastResult.error}
        </div>
      )}
      <aside
        style={{
          position: "fixed",
          top: TOOLBAR_HEIGHT + 16,
          right: PAGE_GAP,
          width: FEEDBACK_PANEL_WIDTH,
          maxHeight: `calc(100vh - ${TOOLBAR_HEIGHT + 32}px)`,
          overflowY: "auto",
          zIndex: 15,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          boxShadow: "0 12px 30px rgba(31, 41, 38, 0.12)",
          padding: 16,
          boxSizing: "border-box",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.text,
            }}
          >
            Live Feedback
          </div>

          <div
            style={{
              padding: "5px 9px",
              borderRadius: 999,
              background: transcribing
                ? "#fff4d6"
                : COLORS.primaryLight,
              color: transcribing
                ? "#946200"
                : COLORS.primary,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {transcribing ? "Reading…" : "Up to date"}
          </div>
        </div>

        <div
          style={{
            color: COLORS.muted,
            fontSize: 13,
            lineHeight: 1.4,
            marginBottom: 16,
          }}
        >
          {mode === "chemistry"
            ? "Review the structure verity.ai read. You can correct the SMILES before checking it."
            : "Review what verity.ai read. You can correct any misread handwriting before checking continues."}
        </div>

        {mode === "chemistry" ? (
          !structureRead ? (
            <div
              style={{
                minHeight: 260,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: 24,
                boxSizing: "border-box",
                borderRadius: 12,
                background: COLORS.background,
                border: `1px dashed ${COLORS.border}`,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 14,
                  borderRadius: "50%",
                  background: COLORS.primaryLight,
                  color: COLORS.primary,
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                ⬡
              </div>

              <div
                style={{
                  marginBottom: 7,
                  color: COLORS.text,
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                Draw the structure
              </div>

              <div
                style={{
                  maxWidth: 240,
                  color: COLORS.muted,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Use the whole page for one molecule, then press Read
                Structure. Set the target SMILES in the toolbar first.
              </div>
            </div>
          ) : (
            (() => {
              const verdictStatus = getVerdictStatus(structureVerdict);

              const status = structureUnreadable
                ? {
                    label: "Needs review",
                    detail: "We could not confidently read this drawing.",
                    color: "#a96b1f",
                    background: "#fff7e8",
                    symbol: "!",
                  }
                : structureVerdict === null
                ? {
                    label: "Waiting",
                    detail: "This structure has not been checked yet.",
                    color: COLORS.muted,
                    background: "#f3f5f4",
                    symbol: "…",
                  }
                : verdictStatus === "valid"
                ? {
                    label: "Correct structure",
                    detail: "This matches the target structure.",
                    color: "#267a55",
                    background: "#edf8f2",
                    symbol: "✓",
                  }
                : verdictStatus === "invalid"
                ? {
                    label: "Review this structure",
                    detail: structureVerdict.error_type
                      ? `Possible ${structureVerdict.error_type.replaceAll(
                          "_",
                          " "
                        )}.`
                      : "This is not the target structure.",
                    color: COLORS.danger,
                    background: "#fff0f0",
                    symbol: "!",
                  }
                : verdictStatus === "parse_error"
                ? {
                    label: "Could not check",
                    detail: "Try redrawing, or edit the SMILES directly.",
                    color: "#a96b1f",
                    background: "#fff7e8",
                    symbol: "?",
                  }
                : {
                    label: "Not supported yet",
                    detail:
                      "This structure is outside the current supported scope.",
                    color: "#a96b1f",
                    background: "#fff7e8",
                    symbol: "?",
                  };

              return (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${status.color}33`,
                    background: status.background,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        background: status.color,
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {status.symbol}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          marginBottom: 3,
                        }}
                      >
                        <div
                          style={{
                            color: COLORS.text,
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        >
                          Structure
                        </div>

                        <div
                          style={{
                            color: status.color,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {status.label}
                        </div>
                      </div>

                      <div
                        style={{
                          color: COLORS.muted,
                          fontSize: 12,
                          lineHeight: 1.35,
                          marginBottom: 8,
                        }}
                      >
                        {status.detail}
                      </div>

                      <input
                        type="text"
                        value={structureSmiles}
                        placeholder={
                          structureUnreadable
                            ? "Type the SMILES you drew"
                            : ""
                        }
                        onChange={(event) =>
                          handleStructureEdit(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                            handleCheckStructure();
                          }
                        }}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "9px 11px",
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 9,
                          background: COLORS.surface,
                          color: COLORS.text,
                          fontFamily: "monospace",
                          fontSize: 14,
                          outline: "none",
                        }}
                      />

                      <button
                        onClick={handleCheckStructure}
                        disabled={
                          !structureSmiles.trim() || !targetSmiles.trim()
                        }
                        style={{
                          width: "100%",
                          marginTop: 8,
                          padding: "9px 14px",
                          background:
                            !structureSmiles.trim() || !targetSmiles.trim()
                              ? "#d8ddda"
                              : COLORS.primary,
                          color: "#fff",
                          border: "none",
                          borderRadius: 9,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor:
                            !structureSmiles.trim() || !targetSmiles.trim()
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {!targetSmiles.trim()
                          ? "Set a target structure first"
                          : "Check Structure"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          )
        ) : lines.length === 0 ? (
          <div
            style={{
              minHeight: 260,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 24,
              boxSizing: "border-box",
              borderRadius: 12,
              background: COLORS.background,
              border: `1px dashed ${COLORS.border}`,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                display: "grid",
                placeItems: "center",
                marginBottom: 14,
                borderRadius: "50%",
                background: COLORS.primaryLight,
                color: COLORS.primary,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              ✎
            </div>

            <div
              style={{
                marginBottom: 7,
                color: COLORS.text,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              Start writing your problem
            </div>

            <div
              style={{
                maxWidth: 240,
                color: COLORS.muted,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Write the problem on the first line, then finish the line
              to begin receiving live feedback.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
          {lines.map((line, index) => {
            const verdict = verdictsByLine.get(line.row);
            const verdictStatus = getVerdictStatus(verdict);
            const isProblem = line.row === handwrittenProblemRow;

            const status = line.unreadable
              ? {
                  label: "Needs review",
                  detail: "We could not confidently read this line.",
                  color: "#a96b1f",
                  background: "#fff7e8",
                  symbol: "!",
                }
              : isProblem
              ? {
                  label: "Problem",
                  detail: "This is the question being solved.",
                  color: "#486b91",
                  background: "#edf4fb",
                  symbol: "P",
                }
              : verdict === undefined
              ? {
                  label: "Waiting",
                  detail: "This line has not been checked yet.",
                  color: COLORS.muted,
                  background: "#f3f5f4",
                  symbol: "…",
                }
              : verdictStatus === "valid"
              ? {
                  label: "Correct step",
                  detail: "This follows from the previous line.",
                  color: "#267a55",
                  background: "#edf8f2",
                  symbol: "✓",
                }
              : verdictStatus === "invalid"
              ? {
                  label: "Review this step",
                  detail:
                    verdict.error_type
                      ? `Possible ${verdict.error_type.replaceAll("_", " ")}.`
                      : "This does not follow from the previous line.",
                  color: COLORS.danger,
                  background: "#fff0f0",
                  symbol: "!",
                }
              : verdictStatus === "parse_error"
              ? {
                  label: "Could not check",
                  detail: "Try rewriting or editing the transcription.",
                  color: "#a96b1f",
                  background: "#fff7e8",
                  symbol: "?",
                }
              : {
                  label: "Not supported yet",
                  detail: "This type of step is outside the current scope.",
                  color: "#a96b1f",
                  background: "#fff7e8",
                  symbol: "?",
                };

            return (
              <div
                key={line.row}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${status.color}33`,
                  background: status.background,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background: status.color,
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {status.symbol}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 3,
                      }}
                    >
                      <div
                        style={{
                          color: COLORS.text,
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        Line {index + 1}
                      </div>

                      <div
                        style={{
                          color: status.color,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {status.label}
                      </div>
                    </div>

                    <div
                      style={{
                        color: COLORS.muted,
                        fontSize: 12,
                        lineHeight: 1.35,
                        marginBottom: 8,
                      }}
                    >
                      {status.detail}
                    </div>

                    <input
                      type="text"
                      value={line.text}
                      placeholder={
                        line.unreadable
                          ? "Type what you wrote"
                          : ""
                      }
                      onChange={(event) =>
                        handleLineEdit(line.row, event.target.value)
                      }
                      onBlur={() => handleLineEditDone(line.row)}
                      onKeyDown={(event) =>
                        event.key === "Enter" &&
                        event.currentTarget.blur()
                      }
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "9px 11px",
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 9,
                        background: COLORS.surface,
                        color: COLORS.text,
                        fontFamily: "monospace",
                        fontSize: 14,
                        outline: "none",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

        {(mode === "chemistry"
          ? getVerdictStatus(structureVerdict) === "invalid"
          : firstWrongLine !== null) && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: `1px solid ${COLORS.border}`,
            }}
          >
            {hintText && (
              <div
                style={{
                  marginBottom: 10,
                  padding: 12,
                  borderRadius: 10,
                  background: COLORS.primaryLight,
                  color: COLORS.text,
                  lineHeight: 1.45,
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    color: COLORS.primary,
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  Hint {hintLevel} of 3
                </div>
                {hintText}
              </div>
            )}

            <button
              onClick={
                mode === "chemistry" ? handleChemistryHint : handleGetHint
              }
              disabled={hintLoading || hintLevel >= 3}
              style={{
                width: "100%",
                padding: "10px 14px",
                background:
                  hintLoading || hintLevel >= 3
                    ? "#d8ddda"
                    : COLORS.primary,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                cursor:
                  hintLoading || hintLevel >= 3
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {hintLoading
                ? "Preparing hint…"
                : hintLevel === 0
                ? "Get a hint"
                : hintLevel >= 3
                ? "All hints shown"
                : "Show another hint"}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
