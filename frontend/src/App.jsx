import { useRef, useState, useEffect, useCallback } from "react";

const LINE_HEIGHT = 64;
const NOTEBOOK_ROWS = 24;
const NOTEBOOK_HEIGHT = NOTEBOOK_ROWS * LINE_HEIGHT;
const TOOLBAR_HEIGHT = 64;
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const LINE_PAD = 16;
const ERASER_RADIUS = 18;

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
  const checkRequestId = useRef(0);
  const hintRequestId = useRef(0);
  const problemRef = useRef("");
  const linesRef = useRef([]);
  const activeRowRef = useRef(null);
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
    if (e.pointerType === "touch") return; // palm rejection
    if (activePointerId.current !== null) return;
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

      setStrokes(updatedStrokes);
      invalidateEditedRow(getStrokeRow(removedStroke));
      return;
    }

    activePointerId.current = e.pointerId;

    // The visible handwriting no longer matches the last transcription.
    // Hide dependent feedback until this row is finished again.
    ++transcriptionRequestId.current;
    transcriptionRowRef.current = null;
    ++checkRequestId.current;
    ++hintRequestId.current;
    setTranscribing(false);
    setVerdictsByLine(new Map());
    setFirstWrongLine(null);
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setLastResult(null);

    canvasRef.current.setPointerCapture(e.pointerId);
    currentStroke.current = { points: [firstPoint], pointerType: e.pointerType };
  };

  const handlePointerMove = (e) => {
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
    if (
      !currentStroke.current ||
      e.pointerId !== activePointerId.current
    ) return;
    const finished = currentStroke.current;
    currentStroke.current = null;
    activePointerId.current = null;
    const row = getStrokeRow(finished);
    activeRowRef.current = row;
    setActiveRow(row);
    setStrokes((prev) => [...prev, finished]);
  };

  const handlePointerCancel = (e) => {
    if (e.pointerId !== activePointerId.current) return;
    currentStroke.current = null;
    activePointerId.current = null;
    drawFrame();
  };

  // Any edit to handwriting makes that row's old transcription and
  // all checker feedback stale.
  const invalidateEditedRow = (row) => {
    ++transcriptionRequestId.current;
    ++checkRequestId.current;
    ++hintRequestId.current;

    transcriptionRowRef.current = null;
    setTranscribing(false);

    // Remove the old transcription for the edited row.
    const updatedLines = linesRef.current.filter((line) => line.row !== row);
    linesRef.current = updatedLines;
    setLines(updatedLines);

    // Make the edited row active so it can be finished/transcribed again.
    activeRowRef.current = row;
    setActiveRow(row);

    // Old verdicts and hints are no longer trustworthy.
    setVerdictsByLine(new Map());
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

    setStrokes((previousStrokes) => previousStrokes.slice(0, -1));
    invalidateEditedRow(affectedRow);
  };

  // Re-judge the whole page. Free (pure SymPy server-side), so it runs on
  // every finished line and every manual correction.
  const recheck = async (lineArr, problemText = problemRef.current) => {
    const requestId = ++checkRequestId.current;
    ++hintRequestId.current;

    // Any change to the work invalidates the current hint ladder.
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setVerdictsByLine(new Map());
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

      setVerdictsByLine(
        new Map(
          data.verdicts
            .filter((v) => v.line_number > 0)
            .map((v) => [rowByLineNumber.get(v.line_number), v])
            .filter(([row]) => row !== undefined)
        )
      );
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

  const handleFinishLine = async () => {
    const segLines = segmentIntoLines(strokes);
    const targetRow = activeRowRef.current;
    if (segLines.size === 0 || targetRow === null || !segLines.has(targetRow)) {
      return;
    }
    const requestId = ++transcriptionRequestId.current;
    transcriptionRowRef.current = targetRow;
    const lineStrokes = segLines.get(targetRow);

    const dataUrl = renderLineToPng(lineStrokes);
    const imageBase64 = dataUrl.split(",")[1]; // strip "data:image/png;base64,"

    setTranscribing(true);
    setLastResult(null);

    let text, unreadable;
    try {
      const res = await fetch(`${API_BASE}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageBase64 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (requestId !== transcriptionRequestId.current) return;
      text = data.text;
      unreadable = data.unreadable;
    } catch (e) {
      if (requestId !== transcriptionRequestId.current) return;
      transcriptionRowRef.current = null;
      setLastResult({ error: e.message });
      setTranscribing(false);
      return;
    }
    if (requestId !== transcriptionRequestId.current) return;
    transcriptionRowRef.current = null;
    setTranscribing(false);

    // Upsert this line (re-finishing a row replaces its transcription).
    const newLines = [
      ...linesRef.current.filter((l) => l.row !== targetRow),
      { row: targetRow, text: unreadable ? "" : text, unreadable },
    ].sort((a, b) => a.row - b.row);
    linesRef.current = newLines;
    setLines(newLines);
    if (activeRowRef.current === targetRow) {
      activeRowRef.current = null;
      setActiveRow(null);
    }
    await recheck(newLines);
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
    setVerdictsByLine(new Map());
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

  const handleLineEditDone = () => {
    recheck(linesRef.current);
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
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
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
      canvas.width = document.documentElement.clientWidth;
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

  const handleClear = () => {
    ++transcriptionRequestId.current;
    ++checkRequestId.current;
    ++hintRequestId.current;

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
          touchAction: "none", 
          display: "block",
          marginTop: TOOLBAR_HEIGHT,
          background: "#faf8f2",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 12,
          boxSizing: "border-box",
          background: "#faf8f2",
          borderBottom: "1px solid #d6d6d6",
        }}
      >
        <input
          type="text"
          value={problem}
          onChange={handleProblemChange}
          onBlur={handleProblemEditDone}
          onKeyDown={(e) =>
            e.key === "Enter" && e.currentTarget.blur()
          }
          placeholder="Optional problem override — otherwise write the problem on line 1"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: 8,
            fontFamily: "monospace",
          }}
        />

        <button
          onClick={() => setActiveTool("pen")}
          style={{
            padding: "8px 16px",
            whiteSpace: "nowrap",
            background: activeTool === "pen" ? "#dcecff" : "#fff",
            border: "1px solid #ccc",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Pen
        </button>

        <button
          onClick={() => setActiveTool("eraser")}
          style={{
            padding: "8px 16px",
            whiteSpace: "nowrap",
            background: activeTool === "eraser" ? "#dcecff" : "#fff",
            border: "1px solid #ccc",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Eraser
        </button>
        <button
          onClick={handleFinishLine}
          disabled={
            transcribing ||
            strokes.length === 0 ||
            activeLineNumber === null
          }
          style={{
            padding: "8px 16px",
            whiteSpace: "nowrap",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 8,
            opacity:
              transcribing ||
              strokes.length === 0 ||
              activeLineNumber === null
                ? 0.5
                : 1,
            cursor:
              transcribing ||
              strokes.length === 0 ||
              activeLineNumber === null
                ? "not-allowed"
                : "pointer",
          }}
        >
          {transcribing
            ? "Transcribing..."
            : activeLineNumber === null
              ? "Finish Line"
              : `Finish line ${activeLineNumber}`}
        </button>

        <button
          onClick={handleUndo}
          disabled={strokes.length === 0 || transcribing}
          style={{
            padding: "8px 16px",
            whiteSpace: "nowrap",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 8,
            opacity:
              strokes.length === 0 || transcribing ? 0.5 : 1,
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
            padding: "8px 16px",
            whiteSpace: "nowrap",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>

      {!problem.trim() && (
        <div
          style={{
            position: "fixed",
            top: 60,
            left: 12,
            zIndex: 20,
            fontSize: 12,
            color: "#a06a3a",
            fontFamily: "monospace",
          }}
        >
          Leave the box blank to use your first handwritten line as the problem.
        </div>
      )}
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
      {lines.length > 0 && (
        <div
          style={{
            position: "fixed", top: 64, right: 12, width: 300,
            background: "#fff", border: "1px solid #ccc", borderRadius: 8,
            padding: 12, maxHeight: "60vh", overflowY: "auto",
            fontFamily: "monospace", fontSize: 13,
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 8, fontFamily: "sans-serif" }}>
            Your work (edit if misread)
          </div>
          {lines.map((l, index) => {
            const verdict = verdictsByLine.get(l.row);
            const verdictStatus = getVerdictStatus(verdict);
            const status =
              l.unreadable
                ? { label: "couldn't read -- type it here", color: "#a06a3a" }
                : l.row === handwrittenProblemRow
                ? { label: "problem", color: "#4b6b9a" }
                : verdict === undefined
              ? { label: "not checked", color: "#888" }
              : verdictStatus === "valid"
              ? { label: "correct", color: "#28a05a" }
              : verdictStatus === "invalid"
              ? { label: verdict.error_type || "wrong", color: "#c83232" }
              : verdictStatus === "parse_error"
              ? { label: "couldn't parse", color: "#a06a3a" }
              : { label: "unsupported", color: "#a06a3a" };
            return (
              <div key={l.row} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: status.color, fontFamily: "sans-serif" }}>
                  line {index + 1}: {status.label}
                </div>
                <input
                  type="text"
                  value={l.text}
                  placeholder={l.unreadable ? "type what you wrote" : ""}
                  onChange={(e) => handleLineEdit(l.row, e.target.value)}
                  onBlur={handleLineEditDone}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                  style={{
                    width: "100%", padding: "4px 8px", boxSizing: "border-box",
                    border: `1px solid ${status.color}`, borderRadius: 4,
                    fontFamily: "monospace",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      {firstWrongLine !== null && (
        <div style={{ position: "fixed", bottom: 12, right: 12, maxWidth: "40vw" }}>
          {hintText && (
            <div
              style={{
                padding: "10px 16px", marginBottom: 8,
                background: "#fff", border: "1px solid #ccc", borderRadius: 8,
              }}
            >
              <strong>Hint {hintLevel}/3:</strong> {hintText}
            </div>
          )}
          <button
            onClick={handleGetHint}
            disabled={hintLoading || hintLevel >= 3}
            style={{
              padding: "8px 16px", background: "#fff",
              border: "1px solid #ccc", borderRadius: 8,
              opacity: hintLoading || hintLevel >= 3 ? 0.5 : 1,
            }}
          >
            {hintLoading
              ? "Loading..."
              : hintLevel === 0
              ? "Get Hint"
              : hintLevel >= 3
              ? "No more hints"
              : "Next Hint"}
          </button>
        </div>
      )}
    </div>
  );
}
