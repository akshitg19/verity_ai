import { useEffect, useRef, useState } from "react";

import { renderLineToPng } from "./canvas/render";
import useCanvas from "./canvas/useCanvas";
import useChemistry from "./chemistry/useChemistry";
import QuestionPrompt from "./chemistry/QuestionPrompt";
import CanvasSurface from "./components/CanvasSurface";
import useKeyboardShortcuts from "./useKeyboardShortcuts";
import FeedbackPanel from "./components/FeedbackPanel";
import PageActions from "./components/PageActions";
import WorkspaceToolbar from "./components/WorkspaceToolbar";
import NotebookSidebar from "./notebook/NotebookSidebar";
import useNotebook from "./notebook/useNotebook";
import { deriveCompletionStatus } from "./notebook/completionStatus";
import useMathWorkflow from "./math/useMathWorkflow";
import WorkspaceActionDialog from "./components/WorkspaceActionDialog";
import useWorkspaceNavigation from "./useWorkspaceNavigation";
import { SURFACES } from "./theme";

const SIDEBAR_WIDTH = 288;

export default function App({ theme: themeFromRoute, subject }) {
  const notebook = useNotebook();
  const pageId = notebook.activePage.id;
  const chemistry = useChemistry({ pageId });
  const math = useMathWorkflow({ pageId });
  const theme = themeFromRoute;
  const mode = notebook.activeNote.subject;
  const [showNotebook, setShowNotebook] = useState(false);
  const loadedPageRef = useRef(null);
  const pendingPageLoadRef = useRef(null);
  const captureEnabled = import.meta.env.VITE_CAPTURE === "1";

  const canvasMode = mode === "chemistry" && chemistry.isDrawing ? "structure" : "rows";
  const activeVerdicts =
    mode === "chemistry" ? chemistry.verdictsByLine : math.verdictsByLine;
  const canvas = useCanvas({
    pageId,
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

  const workspace = useWorkspaceNavigation({ notebook, canvas, mode, chemistry, math });

  useKeyboardShortcuts({
    onUndo: canvas.handleUndo,
    onRedo: canvas.handleRedo,
    onToggleNotebook: () => setShowNotebook((value) => !value),
  });

  useEffect(() => {
    const subjectNote = notebook.notes.find((note) => note.subject === subject);
    if (subjectNote && notebook.activeNote.id !== subjectNote.id) notebook.openNote(subjectNote.id);
    // The notebook object is the intentional source of truth for the route-selected note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook.activeNote.id, notebook.notes, notebook.openNote, subject]);

  const transcribing = mode === "chemistry" ? chemistry.reading : math.transcribing;
  const status = mode === "chemistry" ? chemistry.status : math.lastResult;
  const activeWorkflowSnapshot = mode === "chemistry"
    ? chemistry.getWorkflowSnapshot()
    : math.getWorkflowSnapshot();
  const workflowSignature = JSON.stringify({ ...activeWorkflowSnapshot, updatedAt: 0 });

  useEffect(() => {
    if (loadedPageRef.current === pageId) return;
    loadedPageRef.current = pageId;
    pendingPageLoadRef.current = pageId;
    canvas.loadStrokes(notebook.activePage.strokes ?? []);
    if (mode === "chemistry") {
      chemistry.restoreWorkflowSnapshot(notebook.activePage.workflowSnapshot);
    } else {
      math.restoreWorkflowSnapshot(notebook.activePage.workflowSnapshot);
    }
    // Navigation loads a page once; ink changes are persisted by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook.activePage, notebook.activeNote.id, pageId, mode]);

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
    if (loadedPageRef.current !== pageId || pendingPageLoadRef.current === pageId) return;
    notebook.saveWorkflow(activeWorkflowSnapshot, pageId);
    // Persist the active page's workflow separately from its strokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, workflowSignature]);

  const completionStatus = deriveCompletionStatus({
    subject: mode,
    mathVerdicts: math.verdictsByLine,
    chemistryVerdicts: chemistry.verdictsByLine,
    wholePageVerdict: chemistry.verdict,
  });
  useEffect(() => {
    if (completionStatus) notebook.recordOutcome(completionStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionStatus]);

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
    if (existing) workspace.workspaceNotebook.openNote(existing.id);
    else workspace.workspaceNotebook.createNote(subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, subject, workspace.workspaceNotebook]);

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

  return (
    <div
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
        notebook={workspace.workspaceNotebook}
        open={showNotebook}
        onClose={() => setShowNotebook(false)}
        width={SIDEBAR_WIDTH}
        subject={mode}
        onSubjectChange={workspace.handleModeChange}
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
        notebook={workspace.workspaceNotebook}
        showNotebook={showNotebook}
        onToggleNotebook={() => setShowNotebook((value) => !value)}
        mode={mode}
        onModeChange={workspace.handleModeChange}
        chemistry={chemistry}
        problem={math.problem}
        onProblemChange={math.handleProblemChange}
        onProblemEditDone={math.handleProblemEditDone}
        canvas={canvas}
        theme={theme}
        onFinishLine={canvas.finishActiveRow}
        onReadPage={handleReadPage}
        onClear={workspace.handleClear}
      />
      <PageActions
        mode={mode}
        chemistry={chemistry}
        strokeCount={canvas.strokes.length}
        activeLineNumber={canvas.activeLineNumber}
        onFinishLine={canvas.finishActiveRow}
        onReadPage={handleReadPage}
        onClear={workspace.handleClear}
      />
      <FeedbackPanel
        mode={mode}
        math={math}
        chemistry={chemistry}
        captureEnabled={captureEnabled}
        onCapture={handleCaptureSample}
        onNewQuestion={workspace.handleNewQuestion}
        transcribing={transcribing}
        status={status}
        noteId={notebook.activeNote.id}
        pageId={notebook.activePage.id}
      />
      <WorkspaceActionDialog
        actionDialog={workspace.actionDialog}
        onClose={workspace.closeActionDialog}
        onClear={workspace.confirmClear}
        onCreatePage={workspace.createNewPageForQuestion}
        onKeepInk={workspace.keepInkAndResetProblem}
      />
    </div>
  );
}
