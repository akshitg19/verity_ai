import { useEffect, useRef, useState } from "react";

import { renderLineToPng } from "./canvas/render";
import useCanvas from "./canvas/useCanvas";
import useChemistry from "./chemistry/useChemistry";
import QuestionPrompt from "./chemistry/QuestionPrompt";
import CanvasSurface from "./components/CanvasSurface";
import useKeyboardShortcuts from "./useKeyboardShortcuts";
import useTheme from "./useTheme";
import FeedbackPanel from "./components/FeedbackPanel";
import PageActions from "./components/PageActions";
import WorkspaceToolbar from "./components/WorkspaceToolbar";
import NotebookSidebar from "./notebook/NotebookSidebar";
import useNotebook from "./notebook/useNotebook";
import useMathWorkflow from "./math/useMathWorkflow";
import { SURFACES } from "./theme";

const SIDEBAR_WIDTH = 288;
const SWIPE_DISTANCE = 90;
const SWIPE_SLOPE = 60;

export default function App({ theme: themeFromRoute, subject }) {
  const notebook = useNotebook();
  const chemistry = useChemistry();
  const math = useMathWorkflow();
  const ownTheme = useTheme();
  const theme = themeFromRoute ?? ownTheme;
  const mode = notebook.activeNote.subject;
  const [showNotebook, setShowNotebook] = useState(false);
  const swipeStart = useRef(null);
  const loadedPageRef = useRef(null);
  const pendingPageLoadRef = useRef(null);
  const captureEnabled = import.meta.env.VITE_CAPTURE === "1";

  const canvasMode = mode === "chemistry" && chemistry.isDrawing ? "structure" : "rows";
  const activeVerdicts =
    mode === "chemistry" ? chemistry.verdictsByLine : math.verdictsByLine;
  const canvas = useCanvas({
    canvasMode,
    verdictsByLine: activeVerdicts,
    onRowReady: mode === "chemistry" ? chemistry.queueRow : math.queueRow,
    onRowEdited: mode === "chemistry" ? chemistry.invalidateLine : math.invalidateRow,
    onStructureStrokeStarted: chemistry.invalidateRequests,
    onStructureChanged: chemistry.clearAnswer,
    onCleared: () => {
      math.clear();
      chemistry.clearAnswer();
    },
  });

  useKeyboardShortcuts({
    onUndo: canvas.handleUndo,
    onRedo: canvas.handleRedo,
    onToggleNotebook: () => setShowNotebook((value) => !value),
  });

  const transcribing = mode === "chemistry" ? chemistry.reading : math.transcribing;
  const status = mode === "chemistry" ? chemistry.status : math.lastResult;

  useEffect(() => {
    const pageId = notebook.activePage.id;
    if (loadedPageRef.current === pageId) return;
    loadedPageRef.current = pageId;
    pendingPageLoadRef.current = pageId;
    canvas.loadStrokes(notebook.activePage.strokes ?? []);
    math.clear();
    chemistry.clearAnswer();
    // Navigation loads a page once; ink changes are persisted by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook.activePage.id, notebook.activeNote.id]);

  useEffect(() => {
    if (loadedPageRef.current !== notebook.activePage.id) return;
    if (pendingPageLoadRef.current === notebook.activePage.id) {
      pendingPageLoadRef.current = null;
      return;
    }
    notebook.saveStrokes(canvas.strokes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.strokes, notebook.activePage.id]);

  useEffect(() => {
    const verdictStatus = chemistry.verdict?.status ?? (chemistry.verdict?.valid ? "valid" : null);
    if (verdictStatus) notebook.recordOutcome(verdictStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemistry.verdict]);

  // Once the question is known, name the note after it. The question is
  // already transcribed, so "C3H8 + O2 -> CO2 + H2O" costs nothing and beats
  // "Chemistry 3" when the student comes back to find it. Only ever applied to
  // a note still carrying its generated name.
  useEffect(() => {
    if (mode !== "chemistry" || !chemistry.ready) return;
    notebook.nameFromQuestion(chemistry.problemText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemistry.ready, chemistry.problemText, mode]);

  // The route names the subject, so /chemistry opens a chemistry note even
  // if the last one open was math. Runs once per subject change, not on
  // every render, or it would fight the in-app subject toggle.
  const routedSubjectRef = useRef(null);
  useEffect(() => {
    if (!subject || routedSubjectRef.current === subject) return;
    routedSubjectRef.current = subject;
    if (subject === mode) return;
    const existing = notebook.folders[subject]?.[0];
    if (existing) notebook.openNote(existing.id);
    else notebook.createNote(subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const handleClear = () => {
    canvas.clearPage();
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    notebook.saveStrokes(canvas.getStrokesSnapshot());
    chemistry.resetProblem();
    const existing = notebook.folders[nextMode]?.[0];
    if (existing) notebook.openNote(existing.id);
    else notebook.createNote(nextMode);
  };

  const handleReadPage = async () => {
    if (canvas.strokes.length === 0) return;
    if (!chemistry.isDrawing) {
      canvas.finishActiveRow();
      return;
    }
    try {
      await chemistry.readWork(canvas.getStrokesSnapshot());
    } catch (error) {
      chemistry.setStatus({ error: error.message });
    }
  };

  const handleCaptureSample = async () => {
    if (canvas.strokes.length === 0) {
      chemistry.setStatus({ notice: "Draw something before capturing a sample." });
      return;
    }
    const truth = window.prompt(
      "Type exactly what you drew or wrote. This is the ground truth, so it has " +
        "to come from you rather than from what the model read back."
    );
    if (!truth?.trim()) return;
    try {
      const dataUrl = await renderLineToPng(canvas.getStrokesSnapshot());
      await chemistry.capture(dataUrl.split(",")[1], truth.trim());
    } catch (error) {
      chemistry.setStatus({ error: error.message });
    }
  };

  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dy) > SWIPE_SLOPE) return;
    handleModeChange(dx < 0 ? "chemistry" : "math");
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: SURFACES.paper,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <NotebookSidebar
        notebook={notebook}
        open={showNotebook}
        onClose={() => setShowNotebook(false)}
        width={SIDEBAR_WIDTH}
        subject={mode}
        onSubjectChange={handleModeChange}
      />
      <CanvasSurface canvas={canvas} mode={mode}>
        {mode === "chemistry" && chemistry.questionCandidateRow !== null && (
          <QuestionPrompt
            bounds={canvas.getRowBounds(chemistry.questionCandidateRow)}
            text={
              chemistry.lines.find(
                (line) => line.row === chemistry.questionCandidateRow
              )?.text
            }
            onUseAsQuestion={() =>
              chemistry.useRowAsQuestion(chemistry.questionCandidateRow)
            }
            onDismiss={() =>
              chemistry.dismissQuestionCandidate(chemistry.questionCandidateRow)
            }
          />
        )}
      </CanvasSurface>
      <WorkspaceToolbar
        notebook={notebook}
        showNotebook={showNotebook}
        onToggleNotebook={() => setShowNotebook((value) => !value)}
        mode={mode}
        onModeChange={handleModeChange}
        chemistry={chemistry}
        problem={math.problem}
        onProblemChange={math.handleProblemChange}
        onProblemEditDone={math.handleProblemEditDone}
        canvas={canvas}
        theme={theme}
        onFinishLine={canvas.finishActiveRow}
        onReadPage={handleReadPage}
        onClear={handleClear}
      />
      <PageActions
        mode={mode}
        chemistry={chemistry}
        strokeCount={canvas.strokes.length}
        activeLineNumber={canvas.activeLineNumber}
        onFinishLine={canvas.finishActiveRow}
        onReadPage={handleReadPage}
        onClear={handleClear}
      />
      <FeedbackPanel
        mode={mode}
        math={math}
        chemistry={chemistry}
        captureEnabled={captureEnabled}
        onCapture={handleCaptureSample}
        onChemistryProblemChange={handleClear}
        transcribing={transcribing}
        status={status}
      />
    </div>
  );
}
