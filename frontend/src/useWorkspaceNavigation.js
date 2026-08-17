import { useCallback, useState } from "react";

import { navigate } from "./router";

export default function useWorkspaceNavigation({ notebook, canvas, mode, chemistry, math }) {
  const [actionDialog, setActionDialog] = useState(null);

  const saveActiveWorkflow = useCallback(() => {
    const snapshot = mode === "chemistry"
      ? chemistry.getWorkflowSnapshot()
      : math.getWorkflowSnapshot();
    notebook.saveWorkflow(snapshot, notebook.activePage.id, notebook.activeNote.id);
  }, [chemistry, math, mode, notebook]);

  const saveActivePage = useCallback(() => {
    notebook.saveStrokes(
      canvas.getStrokesSnapshot(),
      notebook.activePage.id,
      notebook.activeNote.id
    );
    saveActiveWorkflow();
  }, [canvas, notebook, saveActiveWorkflow]);

  const handleOpenPage = useCallback((nextPageId) => {
    if (nextPageId === notebook.activePage.id) return;
    saveActivePage();
    void notebook.flushWrites().then(() => notebook.openPage(nextPageId));
  }, [notebook, saveActivePage]);

  const handleOpenNote = useCallback((nextNoteId) => {
    if (nextNoteId === notebook.activeNote.id) return;
    saveActivePage();
    void notebook.flushWrites().then(() => notebook.openNote(nextNoteId));
  }, [notebook, saveActivePage]);

  const handleCreateNote = useCallback((nextMode, title, folderId) => {
    saveActivePage();
    void notebook.flushWrites().then(() => notebook.createNote(nextMode, title, folderId));
  }, [notebook, saveActivePage]);

  const handleAddPage = useCallback(() => {
    saveActivePage();
    void notebook.flushWrites().then(() => notebook.addPage());
  }, [notebook, saveActivePage]);

  const handleDeletePage = useCallback((targetPageId) => {
    saveActivePage();
    void notebook.flushWrites().then(() => notebook.deletePage(targetPageId));
  }, [notebook, saveActivePage]);

  const preparePageExport = useCallback(async () => {
    saveActivePage();
    await notebook.flushWrites();
    return canvas.getStrokesSnapshot();
  }, [canvas, notebook, saveActivePage]);

  const workspaceNotebook = {
    ...notebook,
    openPage: handleOpenPage,
    openNote: handleOpenNote,
    createNote: handleCreateNote,
    addPage: handleAddPage,
    deletePage: handleDeletePage,
    preparePageExport,
    duplicateNote: (noteId) => {
      if (noteId === notebook.activeNote.id) saveActivePage();
      void notebook.flushWrites().then(() => notebook.duplicateNote(noteId));
    },
    deleteNote: (noteId) => {
      if (noteId === notebook.activeNote.id) saveActivePage();
      void notebook.flushWrites().then(() => notebook.deleteNote(noteId));
    },
  };

  const confirmClear = useCallback(() => {
    setActionDialog(null);
    canvas.clearPage();
    if (mode === "chemistry") chemistry.resetProblem();
    else math.clear();
  }, [canvas, chemistry, math, mode]);

  const handleNewQuestion = useCallback(() => {
    if (canvas.strokes.length === 0) {
      if (mode === "chemistry") chemistry.resetProblem();
      else math.clear();
      return;
    }
    setActionDialog({ type: "new-question" });
  }, [canvas.strokes.length, chemistry, math, mode]);

  // Kept as an alias for older toolbar callers. There is one New Question
  // workflow, regardless of which visible button invokes it.
  const handleClear = useCallback(() => {
    handleNewQuestion();
  }, [handleNewQuestion]);

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
    saveActivePage();
    void notebook.flushWrites().then(() => {
      navigate(nextMode === "math" ? "/math" : "/chemistry");
    });
  }, [mode, notebook, saveActivePage]);

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
