import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createDefaultNotebookState,
  createNotebookRepository,
  normalizeNotebookState,
  readLegacyNotebook,
} from "./notebookRepository";
import {
  createBlankNote,
  createBlankPage,
  createNotebookId,
  duplicateNoteRecord,
} from "./notebookModel";

const MAX_FOLDERS = 40;
const MAX_NOTES = 200;

const now = () => Date.now();
function blankFolder(subject, name) {
  return { id: createNotebookId("folder"), subject, name: name || "New folder", createdAt: now() };
}

function initial() {
  try {
    const legacy = readLegacyNotebook();
    if (legacy.state) return normalizeNotebookState(legacy.state, { migrateSeededTitles: true });
  } catch {
    // The repository reports the durable storage failure after mount. A
    // canonical in-memory notebook keeps the workspace usable meanwhile.
  }
  return createDefaultNotebookState();
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function metadataFor(note) {
  return { ...note, updatedAt: now() };
}

export default function useNotebook() {
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  const repositoryRef = useRef(null);
  const repositoryReadyRef = useRef(Promise.resolve(null));
  const writesRef = useRef(Promise.resolve());
  const mountedRef = useRef(true);
  const trackerRef = useRef({ nextRevision: 0, pending: new Set(), error: null });
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saving");
  const [saveError, setSaveError] = useState(null);

  const commitState = useCallback((nextState) => {
    stateRef.current = nextState;
    setState(nextState);
    return nextState;
  }, []);

  const settleWrite = useCallback((revision, error = null) => {
    const tracker = trackerRef.current;
    tracker.pending.delete(revision);
    if (error) {
      tracker.error = { error, revision };
      const message = error instanceof Error ? error.message : "Notebook could not be saved.";
      setSaveError(message);
    }
    if (tracker.pending.size > 0) {
      setSaveStatus("saving");
    } else if (tracker.error) {
      setSaveStatus("error");
    } else {
      setSaveStatus("saved");
    }
  }, []);

  // Every operation captures its target IDs before entering this queue. The
  // queue serialises IndexedDB transactions, while the revision tracker keeps
  // an older resolution from announcing "Saved" over a newer write.
  const enqueueWrite = useCallback((operation) => {
    const revision = ++trackerRef.current.nextRevision;
    trackerRef.current.pending.add(revision);
    setSaveStatus("saving");

    const run = writesRef.current
      .catch(() => undefined)
      .then(async () => {
        const repository = await repositoryReadyRef.current;
        if (!repository || !mountedRef.current) return undefined;
        return operation(repository);
      });
    writesRef.current = run;
    run.then(
      () => settleWrite(revision),
      (error) => settleWrite(revision, error)
    );
    return run;
  }, [settleWrite]);

  useEffect(() => {
    mountedRef.current = true;
    const repository = createNotebookRepository();
    const ready = repository
      .open()
      .then(() => repository.load())
      .then((stored) => {
        if (!mountedRef.current) return null;
        repositoryRef.current = repository;
        if (stored) commitState(stored);
        setHydrated(true);
        setSaveError(null);
        setSaveStatus("saved");
        return repository;
      });
    repositoryReadyRef.current = ready;
    ready.catch((error) => {
      if (!mountedRef.current) return;
      setHydrated(true);
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Notebook storage could not be opened.");
    });

    return () => {
      mountedRef.current = false;
      const closeWhenIdle = Promise.allSettled([writesRef.current, ready]).then(() => repository.close());
      void closeWhenIdle;
    };
  }, [commitState]);

  // `activeNote` and `activePage` are never undefined, and that is a contract
  // rather than a convenience. App reads `notebook.activeNote.subject` and
  // `notebook.activePage.id` during render, so a moment with no notes threw
  // and, with no error boundary above it, took the entire page to white. The
  // optional chaining that used to be here admitted the gap existed and left
  // every caller to remember it.
  //
  // A stored notebook can legitimately arrive empty: hydration replaces state
  // wholesale with whatever came out of IndexedDB, and a browser that clears
  // site data, runs out of quota, or blocks storage in a private window can
  // hand back a root with no notes. Seeding a blank one is what a notes app
  // does in that situation anyway.
  const notes = useMemo(() => {
    const stored = state.notes ?? [];
    return stored.length ? stored : [createBlankNote("math", "Math 1")];
  }, [state.notes]);
  const activeNote = notes.find((note) => note.id === state.activeNoteId) ?? notes[0];
  const activePage =
    activeNote.pages?.find((page) => page.id === activeNote.activePageId) ??
    activeNote.pages?.[0] ??
    createBlankPage(activeNote.subject);

  const folders = useMemo(() => {
    const grouped = { math: [], chemistry: [] };
    for (const note of notes) (grouped[note.subject] ?? grouped.math).push(note);
    for (const key of Object.keys(grouped)) {
      grouped[key].sort(
        (a, b) =>
          Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
          b.updatedAt - a.updatedAt
      );
    }
    return grouped;
  }, [notes]);

  const treeFor = useCallback(
    (subject) => {
      const subjectNotes = folders[subject] ?? [];
      const subjectFolders = (state.folders ?? [])
        .filter((folder) => folder.subject === subject)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((folder) => ({
          ...folder,
          notes: subjectNotes.filter((note) => note.folderId === folder.id),
        }));
      const known = new Set(subjectFolders.map((folder) => folder.id));
      return {
        folders: subjectFolders,
        loose: subjectNotes.filter((note) => !note.folderId || !known.has(note.folderId)),
      };
    },
    [folders, state.folders]
  );

  const updateNote = useCallback(
    (noteId, change, persist = true) => {
      const current = stateRef.current;
      const note = current.notes.find((entry) => entry.id === noteId);
      if (!note) return Promise.resolve();
      const nextNote = metadataFor({ ...note, ...change });
      const nextState = {
        ...current,
        notes: current.notes.map((entry) => (entry.id === noteId ? nextNote : entry)),
      };
      commitState(nextState);
      return persist ? enqueueWrite((repository) => repository.saveNoteMetadata(nextNote)) : Promise.resolve();
    },
    [commitState, enqueueWrite]
  );

  const saveStrokes = useCallback(
    (strokes, targetPageId = null, targetNoteId = null) => {
      const current = stateRef.current;
      const note = current.notes.find((entry) => entry.id === (targetNoteId ?? current.activeNoteId));
      const pageId = targetPageId ?? note?.activePageId ?? note?.pages[0]?.id;
      const page = note?.pages.find((entry) => entry.id === pageId);
      if (!note || !page) return Promise.resolve();
      const nextPage = { ...page, strokes: clone(strokes ?? []) };
      const nextNote = metadataFor({
        ...note,
        pages: note.pages.map((entry) => (entry.id === pageId ? nextPage : entry)),
      });
      const nextState = {
        ...current,
        notes: current.notes.map((entry) => (entry.id === note.id ? nextNote : entry)),
      };
      commitState(nextState);
      const capturedNoteId = note.id;
      const capturedPageId = pageId;
      return enqueueWrite((repository) =>
        repository.savePage({ noteId: capturedNoteId, page: { ...nextPage, id: capturedPageId } })
      );
    },
    [commitState, enqueueWrite]
  );

  const saveWorkflow = useCallback(
    (workflowSnapshot, pageId = null, noteId = null) => {
      const current = stateRef.current;
      const note = current.notes.find((entry) => entry.id === (noteId ?? current.activeNoteId));
      const targetPageId = pageId ?? note?.activePageId ?? note?.pages[0]?.id;
      const page = note?.pages.find((entry) => entry.id === targetPageId);
      if (!note || !page) return Promise.resolve();
      const nextPage = { ...page, workflowSnapshot: clone(workflowSnapshot) };
      const nextNote = metadataFor({
        ...note,
        pages: note.pages.map((entry) => (entry.id === targetPageId ? nextPage : entry)),
      });
      commitState({
        ...current,
        notes: current.notes.map((entry) => (entry.id === note.id ? nextNote : entry)),
      });
      return enqueueWrite((repository) => repository.savePage({ noteId: note.id, page: nextPage }));
    },
    [commitState, enqueueWrite]
  );

  const flushWrites = useCallback(async () => {
    await writesRef.current.catch(() => undefined);
    const failure = trackerRef.current.error;
    if (failure) throw failure.error;
  }, []);

  const retrySave = useCallback(() => {
    trackerRef.current.error = null;
    setSaveError(null);
    return enqueueWrite((repository) => repository.replaceAll(stateRef.current));
  }, [enqueueWrite]);

  const createNote = useCallback(
    (forSubject = "math", title, folderId = null) => {
      const current = stateRef.current;
      const subjectNotes = current.notes.filter((note) => note.subject === forSubject);
      const label = forSubject === "chemistry" ? "Chemistry" : "Math";
      const created = createBlankNote(forSubject, title || `${label} ${subjectNotes.length + 1}`, folderId);
      const nextState = {
        ...current,
        notes: [created, ...current.notes].slice(0, MAX_NOTES),
        activeNoteId: created.id,
      };
      commitState(nextState);
      return enqueueWrite(async (repository) => {
        await repository.saveNoteTree(created);
        await repository.saveRoot(created.id);
      }).then(() => created);
    },
    [commitState, enqueueWrite]
  );

  const duplicateNote = useCallback(
    (noteId) => {
      const current = stateRef.current;
      const source = current.notes.find((note) => note.id === noteId);
      if (!source) return Promise.resolve(null);
      const copy = duplicateNoteRecord(source);
      const nextState = {
        ...current,
        notes: [copy, ...current.notes].slice(0, MAX_NOTES),
        activeNoteId: copy.id,
      };
      commitState(nextState);
      return enqueueWrite(async (repository) => {
        await repository.saveNoteTree(copy);
        await repository.saveRoot(copy.id);
      }).then(() => copy);
    },
    [commitState, enqueueWrite]
  );

  const createFolder = useCallback(
    (subject, name) => {
      const folder = blankFolder(subject, name);
      commitState({
        ...stateRef.current,
        folders: [...(stateRef.current.folders ?? []), folder].slice(0, MAX_FOLDERS),
      });
      return enqueueWrite((repository) => repository.saveFolder(folder)).then(() => folder);
    },
    [commitState, enqueueWrite]
  );

  const renameFolder = useCallback(
    (folderId, name) => {
      const current = stateRef.current;
      const folder = current.folders.find((entry) => entry.id === folderId);
      if (!folder) return Promise.resolve();
      const nextFolder = { ...folder, name: name.slice(0, 60) };
      commitState({ ...current, folders: current.folders.map((entry) => entry.id === folderId ? nextFolder : entry) });
      return enqueueWrite((repository) => repository.saveFolder(nextFolder));
    },
    [commitState, enqueueWrite]
  );

  const deleteFolder = useCallback(
    (folderId) => {
      const current = stateRef.current;
      const nextNotes = current.notes.map((note) => note.folderId === folderId ? metadataFor({ ...note, folderId: null }) : note);
      const nextState = {
        ...current,
        folders: (current.folders ?? []).filter((folder) => folder.id !== folderId),
        notes: nextNotes,
      };
      commitState(nextState);
      return enqueueWrite(async (repository) => {
        await repository.deleteFolder(folderId);
        for (const note of nextNotes) {
          const previous = current.notes.find((entry) => entry.id === note.id);
          if (previous?.folderId === folderId) await repository.saveNoteMetadata(note);
        }
      });
    },
    [commitState, enqueueWrite]
  );

  const moveNoteToFolder = useCallback(
    (noteId, folderId) => updateNote(noteId, { folderId: folderId ?? null }),
    [updateNote]
  );

  const openNote = useCallback(
    (noteId) => {
      const current = stateRef.current;
      if (!current.notes.some((note) => note.id === noteId) || current.activeNoteId === noteId) return Promise.resolve();
      commitState({ ...current, activeNoteId: noteId });
      return enqueueWrite((repository) => repository.saveRoot(noteId));
    },
    [commitState, enqueueWrite]
  );

  const renameNote = useCallback((noteId, title) => updateNote(noteId, { title: title.slice(0, 80) }), [updateNote]);

  const [deleted, setDeleted] = useState(null);
  const [deletedPage, setDeletedPage] = useState(null);

  const deleteNote = useCallback(
    (noteId) => {
      const current = stateRef.current;
      const index = current.notes.findIndex((note) => note.id === noteId);
      if (index === -1) return Promise.resolve();
      const removed = current.notes[index];
      const remaining = current.notes.filter((note) => note.id !== noteId);
      const replacement = remaining.length ? null : createBlankNote("math", "Math 1");
      const nextNotes = replacement ? [replacement] : remaining;
      const nextState = {
        ...current,
        notes: nextNotes,
        activeNoteId: current.activeNoteId === noteId ? nextNotes[0].id : current.activeNoteId,
      };
      setDeleted({ note: removed, index });
      commitState(nextState);
      return enqueueWrite(async (repository) => {
        await repository.deleteNoteTree(removed.id);
        if (replacement) await repository.saveNoteTree(replacement);
        await repository.saveRoot(nextState.activeNoteId);
      });
    },
    [commitState, enqueueWrite]
  );

  const undoDelete = useCallback(() => {
    if (!deleted) return Promise.resolve();
    const current = stateRef.current;
    const notes = [...current.notes];
    notes.splice(Math.min(deleted.index, notes.length), 0, deleted.note);
    const nextState = { ...current, notes, activeNoteId: deleted.note.id };
    commitState(nextState);
    const restored = deleted.note;
    setDeleted(null);
    return enqueueWrite(async (repository) => {
      await repository.saveNoteTree(restored);
      await repository.saveRoot(restored.id);
    });
  }, [commitState, deleted, enqueueWrite]);

  const dismissDeleted = useCallback(() => setDeleted(null), []);

  const togglePin = useCallback((noteId) => {
    const note = stateRef.current.notes.find((entry) => entry.id === noteId);
    return note ? updateNote(noteId, { pinned: !note.pinned }) : Promise.resolve();
  }, [updateNote]);

  const nameFromQuestion = useCallback((question) => {
    const trimmed = (question ?? "").trim();
    if (!trimmed || !activeNote || !/^(Chemistry|Math) \d+$/.test(activeNote.title)) return Promise.resolve();
    return updateNote(activeNote.id, { title: trimmed.slice(0, 60) });
  }, [activeNote, updateNote]);

  const addPage = useCallback(() => {
    const current = stateRef.current;
    const note = current.notes.find((entry) => entry.id === current.activeNoteId);
    if (!note) return Promise.resolve(null);
    const page = createBlankPage(note.subject);
    const nextNote = metadataFor({ ...note, pages: [...note.pages, page], activePageId: page.id });
    commitState({ ...current, notes: current.notes.map((entry) => entry.id === note.id ? nextNote : entry) });
    return enqueueWrite(async (repository) => {
      await repository.saveNoteMetadata(nextNote);
      await repository.saveRoot(current.activeNoteId);
    }).then(() => page);
  }, [commitState, enqueueWrite]);

  const openPage = useCallback((pageId) => {
    const current = stateRef.current;
    const note = current.notes.find((entry) => entry.id === current.activeNoteId);
    if (!note || !note.pages.some((page) => page.id === pageId) || note.activePageId === pageId) return Promise.resolve();
    const nextNote = metadataFor({ ...note, activePageId: pageId });
    commitState({ ...current, notes: current.notes.map((entry) => entry.id === note.id ? nextNote : entry) });
    return enqueueWrite((repository) => repository.saveNoteMetadata(nextNote));
  }, [commitState, enqueueWrite]);

  const deletePage = useCallback((pageId) => {
    const current = stateRef.current;
    const note = current.notes.find((entry) => entry.id === current.activeNoteId);
    const index = note?.pages.findIndex((page) => page.id === pageId) ?? -1;
    if (!note || index === -1 || note.pages.length < 2) return Promise.resolve();
    const removed = note.pages[index];
    const pages = note.pages.filter((page) => page.id !== pageId);
    const nextNote = metadataFor({
      ...note,
      pages,
      activePageId: note.activePageId === pageId ? pages[Math.max(0, index - 1)]?.id ?? pages[0].id : note.activePageId,
    });
    const nextState = { ...current, notes: current.notes.map((entry) => entry.id === note.id ? nextNote : entry) };
    setDeletedPage({ noteId: note.id, page: removed, index, wasActive: note.activePageId === pageId });
    commitState(nextState);
    return enqueueWrite((repository) => repository.deletePageAndUpdateNote({ note: nextNote, pageId }));
  }, [commitState, enqueueWrite]);

  const undoDeletePage = useCallback(() => {
    if (!deletedPage) return Promise.resolve();
    const current = stateRef.current;
    const nextState = {
      ...current,
      notes: current.notes.map((note) => {
        if (note.id !== deletedPage.noteId) return note;
        const pages = [...note.pages];
        pages.splice(Math.min(deletedPage.index, pages.length), 0, deletedPage.page);
        return metadataFor({
          ...note,
          pages,
          activePageId: deletedPage.wasActive ? deletedPage.page.id : note.activePageId,
        });
      }),
    };
    const restoredNote = nextState.notes.find((note) => note.id === deletedPage.noteId);
    commitState(nextState);
    setDeletedPage(null);
    return enqueueWrite((repository) => repository.restorePageAndUpdateNote({ note: restoredNote, page: deletedPage.page }));
  }, [commitState, deletedPage, enqueueWrite]);

  const dismissDeletedPage = useCallback(() => setDeletedPage(null), []);

  const recordOutcome = useCallback((outcome) => {
    if (!activeNote) return Promise.resolve();
    return updateNote(activeNote.id, { lastVerdict: outcome });
  }, [activeNote, updateNote]);

  const exportNotebook = useCallback(async () => {
    await flushWrites();
    const repository = await repositoryReadyRef.current;
    if (repository) return repository.exportData();
    return JSON.stringify({ schemaVersion: 2, exportedAt: new Date().toISOString(), state: stateRef.current }, null, 2);
  }, [flushWrites]);

  const importNotebook = useCallback(async (serialized) => {
    const imported = await enqueueWrite((repository) => repository.importData(serialized));
    if (imported && mountedRef.current) commitState(imported);
    return imported;
  }, [commitState, enqueueWrite]);

  return {
    notes,
    folders,
    folderList: state.folders ?? [],
    treeFor,
    createFolder,
    renameFolder,
    deleteFolder,
    moveNoteToFolder,
    activeNote,
    activePage,
    pageIndex: activeNote?.pages.findIndex((page) => page.id === activePage?.id) ?? 0,
    pageCount: activeNote?.pages.length ?? 0,
    saveStrokes,
    saveWorkflow,
    flushWrites,
    retrySave,
    saveStatus,
    saveError,
    hydrated,
    exportNotebook,
    importNotebook,
    createNote,
    duplicateNote,
    openNote,
    togglePin,
    nameFromQuestion,
    deleted,
    undoDelete,
    dismissDeleted,
    renameNote,
    deleteNote,
    addPage,
    openPage,
    deletePage,
    deletedPage,
    undoDeletePage,
    dismissDeletedPage,
    recordOutcome,
  };
}
