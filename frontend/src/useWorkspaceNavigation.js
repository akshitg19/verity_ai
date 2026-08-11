import { useCallback, useState } from "react";

import { navigate } from "./router";

export default function useWorkspaceNavigation({ notebook, canvas, mode, chemistry, math }) {
  const [actionDialog, setActionDialog] = useState(null);

  const saveActiveWorkflow = useCallback(() => {
    const snapshot = mode === "chemistry"
      ? chemistry.getWorkflowSnapshot()
      : math.getWorkflowSnapshot();
    notebook.saveWorkflow(snapshot, notebook.activePage.id);
  }, [chemistry, math, mode, notebook]);

  const handleOpenPage = useCallback((nextPageId) => {
    if (nextPageId === notebook.activePage.id) return;
    saveActiveWorkflow();
    void notebook.flushWrites().then(() => notebook.openPage(nextPageId));
  }, [notebook, saveActiveWorkflow]);

  const handleOpenNote = useCallback((nextNoteId) => {
    if (nextNoteId === notebook.activeNote.id) return;
    saveActiveWorkflow();
    void notebook.flushWrites().then(() => notebook.openNote(nextNoteId));
  }, [notebook, saveActiveWorkflow]);

  const handleCreateNote = useCallback((nextMode, title, folderId) => {
    saveActiveWorkflow();
    void notebook.flushWrites().then(() => notebook.createNote(nextMode, title, folderId));
  }, [notebook, saveActiveWorkflow]);

  const handleAddPage = useCallback(() => {
    saveActiveWorkflow();
    void notebook.flushWrites().then(() => notebook.addPage());
  }, [notebook, saveActiveWorkflow]);

  const handleDeletePage = useCallback((targetPageId) => {
    notebook.saveStrokes(canvas.getStrokesSnapshot());
    saveActiveWorkflow();
    void notebook.flushWrites().then(() => notebook.deletePage(targetPageId));
  }, [canvas, notebook, saveActiveWorkflow]);

  const workspaceNotebook = {
    ...notebook,
    openPage: handleOpenPage,
    openNote: handleOpenNote,
    createNote: handleCreateNote,
    addPage: handleAddPage,
    deletePage: handleDeletePage,
  };

  const handleClear = useCallback(() => {
    if (canvas.strokes.length > 0) setActionDialog({ type: "clear" });
  }, [canvas.strokes.length]);

  const confirmClear = useCallback(() => {
    setActionDialog(null);
    canvas.clearPage();
  }, [canvas]);

  const handleNewQuestion = useCallback(() => {
    if (canvas.strokes.length === 0) {
      if (mode === "chemistry") chemistry.resetProblem();
      else math.clear();
      return;
    }
    setActionDialog({ type: "new-question" });
  }, [canvas.strokes.length, chemistry, math, mode]);

  const keepInkAndResetProblem = useCallback(() => {
    if (mode === "chemistry") chemistry.resetProblem();
    else math.clear();
    setActionDialog(null);
  }, [chemistry, math, mode]);

  const createNewPageForQuestion = useCallback(() => {
    setActionDialog(null);
    handleAddPage();
  }, [handleAddPage]);

  const closeActionDialog = useCallback(() => setActionDialog(null), []);

  const handleModeChange = useCallback((nextMode) => {
    if (nextMode === mode) return;
    notebook.saveStrokes(canvas.getStrokesSnapshot());
    saveActiveWorkflow();
    navigate(nextMode === "math" ? "/math" : "/chemistry");
  }, [canvas, mode, notebook, saveActiveWorkflow]);

  return {
    actionDialog,
    closeActionDialog,
    confirmClear,
    createNewPageForQuestion,
    handleClear,
    handleModeChange,
    handleNewQuestion,
    keepInkAndResetProblem,
    workspaceNotebook,
  };
}
