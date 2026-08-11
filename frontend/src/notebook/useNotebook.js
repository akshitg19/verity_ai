import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createNotebookRepository, readLegacyNotebook } from "./notebookRepository";

// The notebook model: folders by subject, notes inside them, pages inside
// notes, persisted locally.
//
// The bar here is Apple Notes or Samsung Notes, because that is what
// students already use. A single canvas that grows forever is a demo; a
// place you would keep a term's homework is a product.
//
// Local-first on purpose. Strokes are already serialisable, so persistence
// is a JSON round-trip and needs no backend, no account, and no network.

const MAX_FOLDERS = 40;
const MAX_NOTES = 200;

const now = () => Date.now();
const newId = () =>
  `${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function blankPage() {
  return { id: newId(), strokes: [], workflowSnapshot: null };
}

function blankFolder(subject, name) {
  return { id: newId(), subject, name: name || "New folder", createdAt: now() };
}

function blankNote(subject, title, folderId = null) {
  return {
    id: newId(),
    subject,
    folderId,
    title: title || (subject === "chemistry" ? "Chemistry" : "Math"),
    pages: [blankPage()],
    activePageId: null,
    createdAt: now(),
    updatedAt: now(),
    // Kept per note so reopening a page shows what was flagged last time.
    lastVerdict: null,
    hintsUsed: 0,
  };
}

// The two names the app used to seed a new notebook with. They were only ever
// generated, never typed by a student, so renaming them is safe. Without this
// the new naming only reached people who had never opened the app: everyone
// else kept looking at a note called "First structure", which is exactly the
// name the change existed to get rid of.
const SEEDED_TITLES = { "First problem": "Math 1", "First structure": "Chemistry 1" };

function migrateTitle(note) {
  const renamed = SEEDED_TITLES[note.title];
  return renamed ? { ...note, title: renamed } : note;
}

function initial() {
  const stored = (() => {
    try {
      return readLegacyNotebook().state;
    } catch {
      // IndexedDB reports the durable storage failure to the UI. This synchronous
      // fallback keeps the workspace usable while that report is rendered.
      return null;
    }
  })();
  if (stored) {
    // Migration: notes written before folders existed have no folderId, and
    // null means "loose in this subject", which is exactly where they were.
    return {
      folders: [],
      ...stored,
      notes: stored.notes.map((note) =>
        migrateTitle({
          folderId: null,
          ...note,
          pages: (note.pages ?? []).map((page) => ({
            workflowSnapshot: null,
            ...page,
          })),
        })
      ),
    };
  }
  const math = blankNote("math", "Math 1");
  const chemistry = blankNote("chemistry", "Chemistry 1");
  return { folders: [], notes: [math, chemistry], activeNoteId: math.id };
}

function metadataOnly(state) {
  return {
    activeNoteId: state.activeNoteId,
    folders: state.folders ?? [],
    notes: (state.notes ?? []).map((note) => ({
      ...note,
      pages: (note.pages ?? []).map((page) => {
        const metadata = { ...page };
        delete metadata.strokes;
        delete metadata.workflowSnapshot;
        return metadata;
      }),
    })),
  };
}

export default function useNotebook() {
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  const repositoryRef = useRef(null);
  const writesRef = useRef(Promise.resolve());
  const hydratedRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState("saving");
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const enqueueWrite = useCallback((operation) => {
    const repository = repositoryRef.current;
    if (!repository) return Promise.resolve();
    setSaveStatus("saving");
    setSaveError(null);
    const next = writesRef.current.then(operation, operation);
    writesRef.current = next.catch(() => undefined);
    next.then(
      () => setSaveStatus("saved"),
      (error) => {
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : "Notebook could not be saved.");
      }
    );
    return next;
  }, []);

  const persistMetadata = useCallback(
    () => enqueueWrite(() => repositoryRef.current?.saveMetadata(metadataOnly(stateRef.current))),
    [enqueueWrite]
  );

  useEffect(() => {
    let cancelled = false;
    const repository = createNotebookRepository();
    repository
      .open()
      .then(() => repository.load())
      .then((stored) => {
        if (cancelled) return;
        repositoryRef.current = repository;
        hydratedRef.current = true;
        if (stored) {
          stateRef.current = stored;
          setState(stored);
        }
        setSaveStatus("saved");
        return repository.saveMetadata(metadataOnly(stored ?? stateRef.current));
      })
      .catch((error) => {
        if (cancelled) return;
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : "Notebook storage could not be opened.");
      });
    return () => {
      cancelled = true;
      void writesRef.current;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void persistMetadata();
  }, [state, persistMetadata]);

  const notes = state.notes;
  const activeNote =
    notes.find((note) => note.id === state.activeNoteId) ?? notes[0];
  const activePage =
    activeNote.pages.find((page) => page.id === activeNote.activePageId) ??
    activeNote.pages[0];

  // `folders` keeps its old shape, notes grouped by subject, because App and
  // the toolbar both index it by subject. The user-created folders are a
  // separate structure layered on top.
  const folders = useMemo(() => {
    const grouped = { math: [], chemistry: [] };
    for (const note of notes) {
      (grouped[note.subject] ?? grouped.math).push(note);
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort(
        (a, b) =>
          Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
          b.updatedAt - a.updatedAt
      );
    }
    return grouped;
  }, [notes]);

  // What the sidebar renders for one subject: the folders a student made,
  // each with its notes, plus whatever is still loose at the top level.
  const treeFor = useCallback(
    (subject) => {
      const subjectNotes = (folders[subject] ?? []);
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
        // A note whose folder was deleted falls back to loose rather than
        // disappearing from the sidebar entirely.
        loose: subjectNotes.filter(
          (note) => !note.folderId || !known.has(note.folderId)
        ),
      };
    },
    [folders, state.folders]
  );

  const update = useCallback((noteId, change) => {
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === noteId ? { ...note, ...change, updatedAt: now() } : note
      ),
    }));
  }, []);

  const saveStrokes = useCallback(
    (strokes) => {
      const current = stateRef.current;
      const note = current.notes.find((entry) => entry.id === current.activeNoteId);
      if (!note) return;
      const pageId = note.activePageId ?? note.pages[0].id;
      const page = note.pages.find((entry) => entry.id === pageId);
      if (!page) return;
      const nextPage = { ...page, strokes: [...(strokes ?? [])] };
      const nextState = {
        ...current,
        notes: current.notes.map((entry) =>
          entry.id !== note.id
            ? entry
            : {
                ...entry,
                updatedAt: now(),
                pages: entry.pages.map((entryPage) =>
                  entryPage.id === pageId ? nextPage : entryPage
                ),
              }
        ),
      };
      stateRef.current = nextState;
      setState(nextState);
      void enqueueWrite(() =>
        repositoryRef.current?.savePage({ noteId: note.id, page: nextPage })
      );
    },
    [enqueueWrite]
  );

  const saveWorkflow = useCallback(
    (workflowSnapshot, pageId = null) => {
      const current = stateRef.current;
      const note = current.notes.find((entry) => entry.id === current.activeNoteId);
      const targetPageId = pageId ?? note?.activePageId ?? note?.pages[0]?.id;
      if (!note || !targetPageId) return;
      const page = note.pages.find((entry) => entry.id === targetPageId);
      if (!page) return;
      const nextPage = { ...page, workflowSnapshot };
      const nextState = {
        ...current,
        notes: current.notes.map((entry) =>
          entry.id !== note.id
            ? entry
            : {
                ...entry,
                updatedAt: now(),
                pages: entry.pages.map((entryPage) =>
                  entryPage.id === targetPageId ? nextPage : entryPage
                ),
              }
        ),
      };
      stateRef.current = nextState;
      setState(nextState);
      void enqueueWrite(() =>
        repositoryRef.current?.savePage({ noteId: note.id, page: nextPage })
      );
    },
    [enqueueWrite]
  );

  const flushWrites = useCallback(() => writesRef.current, []);

  const createNote = useCallback(
    (forSubject = "math", title, folderId = null) => {
      let created;
      setState((current) => {
        // Numbered rather than all called the same thing. "Chemistry 3" is
        // something a student can find again; three rows reading "Chemistry"
        // is a list they have to open one at a time.
        const used = current.notes.filter((note) => note.subject === forSubject);
        const label = forSubject === "chemistry" ? "Chemistry" : "Math";
        const fallback = `${label} ${used.length + 1}`;
        created = blankNote(forSubject, title || fallback, folderId);
        return {
          ...current,
          notes: [created, ...current.notes].slice(0, MAX_NOTES),
          activeNoteId: created.id,
        };
      });
      return created;
    },
    []
  );

  // A copy of a note, ink and all, which is how a student reuses a page of
  // working as the starting point for the next question.
  const duplicateNote = useCallback((noteId) => {
    setState((current) => {
      const source = current.notes.find((note) => note.id === noteId);
      if (!source) return current;
      const copy = {
        ...source,
        id: newId(),
        title: `${source.title} copy`.slice(0, 80),
        createdAt: now(),
        updatedAt: now(),
        pages: source.pages.map((page) => ({ ...page, id: newId() })),
        activePageId: null,
        lastVerdict: null,
      };
      return {
        ...current,
        notes: [copy, ...current.notes].slice(0, MAX_NOTES),
        activeNoteId: copy.id,
      };
    });
  }, []);

  const createFolder = useCallback((subject, name) => {
    const folder = blankFolder(subject, name);
    setState((current) => ({
      ...current,
      folders: [...(current.folders ?? []), folder].slice(0, MAX_FOLDERS),
    }));
    return folder;
  }, []);

  const renameFolder = useCallback((folderId, name) => {
    setState((current) => ({
      ...current,
      folders: (current.folders ?? []).map((folder) =>
        folder.id === folderId ? { ...folder, name: name.slice(0, 60) } : folder
      ),
    }));
  }, []);

  // Deleting a folder keeps its notes. Losing a term of homework because a
  // folder was tidied away is not a trade worth offering.
  const deleteFolder = useCallback((folderId) => {
    setState((current) => ({
      ...current,
      folders: (current.folders ?? []).filter((folder) => folder.id !== folderId),
      notes: current.notes.map((note) =>
        note.folderId === folderId ? { ...note, folderId: null } : note
      ),
    }));
  }, []);

  const moveNoteToFolder = useCallback(
    (noteId, folderId) => update(noteId, { folderId: folderId ?? null }),
    [update]
  );

  const openNote = useCallback((noteId) => {
    setState((current) => ({ ...current, activeNoteId: noteId }));
  }, []);

  const renameNote = useCallback(
    (noteId, title) => update(noteId, { title: title.slice(0, 80) }),
    [update]
  );

  // Deleting is undoable for as long as the shelf is open. A term of homework
  // behind a single tap with no way back is the one failure mode of this
  // model that would actually matter to a student.
  const [deleted, setDeleted] = useState(null);
  const [deletedPage, setDeletedPage] = useState(null);

  const deleteNote = useCallback((noteId) => {
    setState((current) => {
      const index = current.notes.findIndex((note) => note.id === noteId);
      if (index === -1) return current;
      setDeleted({ note: current.notes[index], index });

      const remaining = current.notes.filter((note) => note.id !== noteId);
      if (!remaining.length) {
        const replacement = blankNote("math", "Math 1");
        return { ...current, notes: [replacement], activeNoteId: replacement.id };
      }
      return {
        ...current,
        notes: remaining,
        activeNoteId:
          current.activeNoteId === noteId ? remaining[0].id : current.activeNoteId,
      };
    });
  }, []);

  const undoDelete = useCallback(() => {
    setState((current) => {
      if (!deleted) return current;
      const notes = [...current.notes];
      notes.splice(Math.min(deleted.index, notes.length), 0, deleted.note);
      return { ...current, notes, activeNoteId: deleted.note.id };
    });
    setDeleted(null);
  }, [deleted]);

  const dismissDeleted = useCallback(() => setDeleted(null), []);

  // Pinned notes sort to the top of their subject, which is how a student
  // keeps the question they are working on within reach of a thumb.
  const togglePin = useCallback(
    (noteId) => {
      setState((current) => ({
        ...current,
        notes: current.notes.map((note) =>
          note.id === noteId ? { ...note, pinned: !note.pinned } : note
        ),
      }));
    },
    []
  );

  // Naming a note after the question it holds. The question is already
  // transcribed, so "Balance C3H8 + O2" costs nothing and beats "Chemistry 3".
  // Only ever applied to a note still carrying its generated name, so a name
  // a student chose is never overwritten.
  const nameFromQuestion = useCallback(
    (question) => {
      const trimmed = (question ?? "").trim();
      if (!trimmed) return;
      setState((current) => {
        const note = current.notes.find((entry) => entry.id === current.activeNoteId);
        if (!note || !/^(Chemistry|Math) \d+$/.test(note.title)) return current;
        return {
          ...current,
          notes: current.notes.map((entry) =>
            entry.id === note.id
              ? { ...entry, title: trimmed.slice(0, 60), updatedAt: now() }
              : entry
          ),
        };
      });
    },
    []
  );

  const addPage = useCallback(() => {
    const page = blankPage();
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id !== current.activeNoteId
          ? note
          : {
              ...note,
              updatedAt: now(),
              pages: [...note.pages, page],
              activePageId: page.id,
            }
      ),
    }));
    return page;
  }, []);

  const openPage = useCallback((pageId) => {
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id !== current.activeNoteId ? note : { ...note, activePageId: pageId }
      ),
    }));
  }, []);

  const deletePage = useCallback((pageId) => {
    const current = stateRef.current;
    const note = current.notes.find((entry) => entry.id === current.activeNoteId);
    const index = note?.pages.findIndex((page) => page.id === pageId) ?? -1;
    if (!note || index === -1 || note.pages.length < 2) return;
    const deletedRecord = {
      noteId: note.id,
      page: note.pages[index],
      index,
      wasActive: note.activePageId === pageId,
    };
    const pages = note.pages.filter((page) => page.id !== pageId);
    const nextNote = {
      ...note,
      updatedAt: now(),
      pages,
      activePageId:
        note.activePageId === pageId
          ? pages[Math.max(0, index - 1)]?.id ?? pages[0].id
          : note.activePageId,
    };
    const nextState = {
      ...current,
      notes: current.notes.map((entry) =>
        entry.id === note.id ? nextNote : entry
      ),
    };
    stateRef.current = nextState;
    setState(nextState);
    setDeletedPage(deletedRecord);
    void enqueueWrite(() => repositoryRef.current?.deletePage(pageId));
    void enqueueWrite(() => repositoryRef.current?.saveMetadata(metadataOnly(nextState)));
  }, [enqueueWrite]);

  const undoDeletePage = useCallback(() => {
    if (!deletedPage) return;
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => {
        if (note.id !== deletedPage.noteId) return note;
        const pages = [...note.pages];
        pages.splice(Math.min(deletedPage.index, pages.length), 0, deletedPage.page);
        return {
          ...note,
          updatedAt: now(),
          pages,
          activePageId: deletedPage.wasActive ? deletedPage.page.id : note.activePageId,
        };
      }),
    }));
    void enqueueWrite(() => repositoryRef.current?.savePage({ noteId: deletedPage.noteId, page: deletedPage.page }));
    setDeletedPage(null);
  }, [deletedPage, enqueueWrite]);

  const dismissDeletedPage = useCallback(() => setDeletedPage(null), []);

  // Which lines were flagged and which hints were used, kept with the note
  // so navigating back through past work shows what happened, not just ink.
  const recordOutcome = useCallback(
    (outcome) => update(activeNote.id, { lastVerdict: outcome }),
    [activeNote.id, update]
  );

  const exportNotebook = useCallback(async () => {
    if (repositoryRef.current) return repositoryRef.current.exportData();
    return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), state: stateRef.current }, null, 2);
  }, []);

  const importNotebook = useCallback(async (serialized) => {
    if (!repositoryRef.current) {
      throw new Error("Notebook storage is still starting. Try again in a moment.");
    }
    const imported = await repositoryRef.current.importData(serialized);
    stateRef.current = imported;
    setState(imported);
    setSaveStatus("saved");
    return imported;
  }, []);

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
    pageIndex: activeNote.pages.findIndex((page) => page.id === activePage.id),
    pageCount: activeNote.pages.length,
    saveStrokes,
    saveWorkflow,
    flushWrites,
    saveStatus,
    saveError,
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
