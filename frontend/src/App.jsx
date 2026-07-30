import { useRef, useState, useEffect, useCallback } from "react";

const LINE_HEIGHT = 64;
const NOTEBOOK_ROWS = 24;
const NOTEBOOK_HEIGHT = NOTEBOOK_ROWS * LINE_HEIGHT;
const TOOLBAR_HEIGHT = 72;
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const LINE_PAD = 16;
const ERASER_RADIUS = 18;
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

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy)
    )
  );

  const closestX = start.x + t * dx;
  const closestY = start.y + t * dy;

  return Math.hypot(point.x - closestX, point.y - closestY);
}

function strokeTouchesPoint(stroke, point) {
  const points = stroke.points;

  if (points.length === 1) {
    return (
      Math.hypot(point.x - points[0].x, point.y - points[0].y) <=
      ERASER_RADIUS
    );
  }

  for (let index = 1; index < points.length; index += 1) {
    if (
      distanceToSegment(point, points[index - 1], points[index]) <=
      ERASER_RADIUS
    ) {
      return true;
    }
  }

  return false;
}

function getVerdictStatus(verdict) {
  if (!verdict) return null;
  // `status` is the API source of truth. Keep the fallback while older
  // backends are still in circulation during local development.
  return verdict.status ?? (verdict.valid ? "valid" : "invalid");
}

// Group strokes into lines by which ruled row each stroke's
// vertical center falls into. Returns a map: rowIndex -> strokes[].
function getStrokeRow(stroke) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of stroke.points) {
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return Math.floor((minY + maxY) / 2 / LINE_HEIGHT);
}

function segmentIntoLines(strokes) {
  const lines = new Map();
  for (const stroke of strokes) {
    const row = getStrokeRow(stroke);
    if (!lines.has(row)) lines.set(row, []);
    lines.get(row).push(stroke);
  }
  return lines;
}

// Renders one detected line's strokes onto a fresh, tightly-cropped canvas --
// paper background + a single ruled line for context + ink only. Deliberately
// excludes the on-screen segmentation debug overlay (boxes/labels), which is
// for the writer's eyes only and previously leaked into exported PNGs when
// people screenshotted the canvas instead of using a real export path.
function renderLineToPng(lineStrokes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of lineStrokes) {
    for (const pt of s.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  const width = maxX - minX + LINE_PAD * 2;
  const height = maxY - minY + LINE_PAD * 2;
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

  return off.toDataURL("image/png");
}

export default function App() {
  const canvasRef = useRef(null);
  const [strokes, setStrokes] = useState([]); // finished strokes
  const [activeTool, setActiveTool] = useState("pen");
  const currentStroke = useRef(null); // stroke in progress
  const activePointerId = useRef(null);
  const transcriptionRequestId = useRef(0);
  const transcriptionRowRef = useRef(null);
  const processingRowsRef = useRef(new Set());
  const rowQueueRef = useRef([]);
  const queueRunningRef = useRef(false);
  const rowIdleTimerRef = useRef(null);
  const dirtyRowsRef = useRef(new Set());
  const strokesRef = useRef([]);
  const checkRequestId = useRef(0);
  const hintRequestId = useRef(0);
  const problemRef = useRef("");
  const linesRef = useRef([]);
  const activeRowRef = useRef(null);
  const penSettingsRef = useRef(null);
  const [transcribing, setTranscribing] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { error } | { warning }

  const [problem, setProblem] = useState("");
  // One entry per finished handwritten line:
  // { row, text, unreadable } -- text is editable in the side panel, so a
  // misread transcription is a one-second typed fix instead of a dead end.
  const [lines, setLines] = useState([]);
  const [activeRow, setActiveRow] = useState(null);
  const [verdictsByLine, setVerdictsByLine] = useState(new Map()); // row -> LineVerdict
  const [firstWrongLine, setFirstWrongLine] = useState(null);

  const [hintLevel, setHintLevel] = useState(0); // 0 = no hint requested yet
  const [hintText, setHintText] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);

  const [penColor, setPenColor] = useState("#1f2926");
  const [penWidth, setPenWidth] = useState(4);
  const [showPenSettings, setShowPenSettings] = useState(false);

  const getPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: e.timeStamp,
      p: e.pressure,
    };
  };

  const handlePointerDown = (e) => {
    if (activeTool === "scroll") return;
    if (e.pointerType === "touch") return; // palm rejection
    if (activePointerId.current !== null) return;

    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
    }

    const firstPoint = getPoint(e);

    if (activeTool === "eraser") {
      const strokeIndex = strokes.findLastIndex((stroke) =>
        strokeTouchesPoint(stroke, firstPoint)
      );

      if (strokeIndex === -1) return;

      const removedStroke = strokes[strokeIndex];
      const updatedStrokes = strokes.filter(
        (_, index) => index !== strokeIndex
      );

      strokesRef.current = updatedStrokes;
      setStrokes(updatedStrokes);
      invalidateEditedRow(getStrokeRow(removedStroke));
      return;
    }

    const newRow = Math.floor(firstPoint.y / LINE_HEIGHT);
    const previousRow = activeRowRef.current;

    const movedToLowerRow =
      previousRow !== null &&
      newRow > previousRow;

    if (movedToLowerRow) {
      queueRow(previousRow);
    }

    activePointerId.current = e.pointerId;

    if (transcriptionRowRef.current === newRow) {
      ++transcriptionRequestId.current;
      transcriptionRowRef.current = null;
      processingRowsRef.current.delete(newRow);

      rowQueueRef.current = rowQueueRef.current.filter(
        (row) => row !== newRow
      );
    }

    // The written work changed, so existing verdicts and hints may be stale.
    // This does not cancel transcription running for a different row.
    ++checkRequestId.current;
    ++hintRequestId.current;

    // Preserve verdicts above the row being edited.
    // This row and every later row may now be affected.
    setVerdictsByLine((currentVerdicts) =>
      new Map(
        [...currentVerdicts].filter(
          ([verdictRow]) => verdictRow < newRow
        )
      )
    );
    setFirstWrongLine(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setLastResult(null);

    canvasRef.current.setPointerCapture(e.pointerId);
    currentStroke.current = { 
      points: [firstPoint], 
      pointerType: e.pointerType,
      color: penColor,
      width: penWidth, 
    };
  };

  const handlePointerMove = (e) => {
    if (e.pointerType === "touch") return;

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
    drawFrame();
  };

  const handlePointerUp = (e) => {
    if (e.pointerType === "touch") return;

    if (
      !currentStroke.current ||
      e.pointerId !== activePointerId.current
    ) return;
    const finished = currentStroke.current;
    currentStroke.current = null;
    activePointerId.current = null;
    const row = getStrokeRow(finished);

    // This row's handwriting no longer matches its saved transcription.
    dirtyRowsRef.current.add(row);

    activeRowRef.current = row;
    setActiveRow(row);

    setStrokes((previousStrokes) => {
      const updatedStrokes = [...previousStrokes, finished];
      strokesRef.current = updatedStrokes;
      return updatedStrokes;
    });

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
    currentStroke.current = null;
    activePointerId.current = null;
    drawFrame();
  };

  const invalidateEditedRow = (row) => {
    // Only this row needs handwriting transcription again.
    dirtyRowsRef.current.add(row);

    ++checkRequestId.current;
    ++hintRequestId.current;

    // Remove this row from the waiting queue so its newest version
    // can be queued again after the user finishes editing.
    rowQueueRef.current = rowQueueRef.current.filter(
      (queuedRow) => queuedRow !== row
    );

    processingRowsRef.current.delete(row);

    // Cancel transcription only if this exact row is currently processing.
    if (transcriptionRowRef.current === row) {
      ++transcriptionRequestId.current;
      transcriptionRowRef.current = null;
    }

    // Remove only this row's old transcription.
    const updatedLines = linesRef.current.filter(
      (line) => line.row !== row
    );

    linesRef.current = updatedLines;
    setLines(updatedLines);

    // Make the edited row active so the idle timer or Check Line button
    // can submit it again.
    activeRowRef.current = row;
    setActiveRow(row);

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
    if (strokes.length === 0 || transcribing) return;

    const removedStroke = strokes[strokes.length - 1];
    const affectedRow = getStrokeRow(removedStroke);

    setStrokes((previousStrokes) => {
      const updatedStrokes = previousStrokes.slice(0, -1);
      strokesRef.current = updatedStrokes;
      return updatedStrokes;
    });
    invalidateEditedRow(affectedRow);
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

  const processRow = async (targetRow) => {
    const segLines = segmentIntoLines(strokesRef.current);

    if (
      targetRow === null ||
      !segLines.has(targetRow)
    ) {
      return;
    }

    const requestId = ++transcriptionRequestId.current;
    transcriptionRowRef.current = targetRow;

    const lineStrokes = segLines.get(targetRow);
    const dataUrl = renderLineToPng(lineStrokes);
    const imageBase64 = dataUrl.split(",")[1];

    setLastResult(null);

    try {
      const response = await fetch(`${API_BASE}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      if (requestId !== transcriptionRequestId.current) {
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
        setActiveRow(null);
      }

      await recheck(
        newLines,
        problemRef.current,
        targetRow
      );
    } catch (error) {
      if (requestId !== transcriptionRequestId.current) {
        return;
      }

      setLastResult({
        error: error.message,
      });
    } finally {
      if (transcriptionRowRef.current === targetRow) {
        transcriptionRowRef.current = null;
      }
    }
  };

  const runRowQueue = async () => {
    if (queueRunningRef.current) {
      return;
    }

    queueRunningRef.current = true;
    setTranscribing(true);

    try {
      while (rowQueueRef.current.length > 0) {
        const targetRow = rowQueueRef.current.shift();

        await processRow(targetRow);

        processingRowsRef.current.delete(targetRow);
      }
    } finally {
      queueRunningRef.current = false;
      transcriptionRowRef.current = null;
      setTranscribing(false);
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

    const segLines = segmentIntoLines(strokesRef.current);

    if (!segLines.has(targetRow)) {
      return;
    }

    // Do not queue the same row more than once.
    if (processingRowsRef.current.has(targetRow)) {
      return;
    }

    processingRowsRef.current.add(targetRow);
    rowQueueRef.current.push(targetRow);

    // Start the queue without blocking handwriting input.
    void runRowQueue();
  };

  const handleFinishLine = () => {
    queueRow(activeRowRef.current);
  };

  // Manual correction in the side panel: update text, clear the unreadable
  // flag once the student has typed something, and re-judge.
  const handleLineEdit = (row, newText) => {
    if (transcriptionRowRef.current === row) {
      ++transcriptionRequestId.current;
      transcriptionRowRef.current = null;
      setTranscribing(false);
    }
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

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
    for (let y = LINE_HEIGHT; y < canvas.height; y += LINE_HEIGHT) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Ink strokes -- kept dark/opaque so they stay visually dominant over
    // the lighter ruling drawn above.
    ctx.strokeStyle = "#1a1a2e";
    ctx.fillStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) drawStroke(ctx, s);
    if (currentStroke.current) drawStroke(ctx, currentStroke.current);

    // Segmentation debug view: box around each detected line, colored by
    // /check's verdict once one exists -- green for a correct step, red for
    // a flagged one, the original neutral blue for lines not yet checked
    // (no problem set, or this line hasn't been sent to /check yet).
    const lines = segmentIntoLines(strokes);
    const lineNumberByRow = new Map(
      [...lines.keys()]
        .sort((a, b) => a - b)
        .map((row, index) => [row, index + 1])
    );
    ctx.font = "11px sans-serif";
    for (const [row, lineStrokes] of lines) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const s of lineStrokes) {
        for (const pt of s.points) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
      }
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
  }, [strokes, drawStroke, verdictsByLine]);

  // Keep the notebook at least 24 rows tall so the page can scroll.
  useEffect(() => {
    const canvas = canvasRef.current;

    const resize = () => {
      canvas.width = Math.max(
        640,
        document.documentElement.clientWidth -
          FEEDBACK_PANEL_WIDTH -
          PAGE_GAP * 3
      );
      canvas.height = Math.max(
        NOTEBOOK_HEIGHT,
        window.innerHeight - TOOLBAR_HEIGHT
      );

      drawFrame();
    };

    resize();
    window.addEventListener("resize", resize);

    return () => window.removeEventListener("resize", resize);
  }, [drawFrame]);

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

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const handleClear = () => {
    ++transcriptionRequestId.current;
    ++checkRequestId.current;
    ++hintRequestId.current;

    if (rowIdleTimerRef.current) {
      clearTimeout(rowIdleTimerRef.current);
      rowIdleTimerRef.current = null;
    }

    rowQueueRef.current = [];
    processingRowsRef.current.clear();
    dirtyRowsRef.current.clear();
    queueRunningRef.current = false;
    strokesRef.current = [];

    currentStroke.current = null;
    activePointerId.current = null;
    transcriptionRowRef.current = null;
    activeRowRef.current = null;
    linesRef.current = [];

    setStrokes([]);
    setLines([]);
    setActiveRow(null);
    setVerdictsByLine(new Map());
    setFirstWrongLine(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setTranscribing(false);
    setLastResult(null);
  };

  const activeLineNumber =
    activeRow === null
      ? null
      : [...segmentIntoLines(strokes).keys()].sort((a, b) => a - b)
          .indexOf(activeRow) + 1 || null;

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
        background: "#faf8f2" 
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ 
          touchAction: activeTool === "scroll" ? "pan-y" : "none", 
          display: "block",
          marginTop: TOOLBAR_HEIGHT,
          background: "#faf8f2",
          borderRight: `1px solid ${COLORS.border}`,
        }}
      />
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

          <button
            onClick={handleUndo}
            disabled={strokes.length === 0 || transcribing}
            style={{
              padding: "10px 16px",
              whiteSpace: "nowrap",
              background: COLORS.surface,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              opacity:
                strokes.length === 0 || transcribing ? 0.4 : 1,
              cursor:
                strokes.length === 0 || transcribing
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
          Review what verity.ai read. You can correct any misread
          handwriting before checking continues.
        </div>

        {lines.length === 0 ? (
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

        {firstWrongLine !== null && (
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
              onClick={handleGetHint}
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
