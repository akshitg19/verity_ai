import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// The notebook model: folders by subject, notes inside them, pages inside
// notes, persisted locally.
//
// The bar here is Apple Notes or Samsung Notes, because that is what
// students already use. A single canvas that grows forever is a demo; a
// place you would keep a term's homework is a product.
//
// Local-first on purpose. Strokes are already serialisable, so persistence
// is a JSON round-trip and needs no backend, no account, and no network.

const STORAGE_KEY = "verity.notebook.v1";
const MAX_NOTES = 200;

const now = () => Date.now();
const newId = () =>
  `${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function blankPage() {
  return { id: newId(), strokes: [] };
}

function blankNote(subject, title) {
  return {
    id: newId(),
    subject,
    title: title || (subject === "chemistry" ? "New structure" : "New problem"),
    pages: [blankPage()],
    activePageId: null,
    createdAt: now(),
    updatedAt: now(),
    // Kept per note so reopening a page shows what was flagged last time.
    lastVerdict: null,
    hintsUsed: 0,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.notes) || !parsed.notes.length) {
      return null;
    }
    return parsed;
  } catch {
    // A corrupt store is not worth a crash; start fresh and move on.
    return null;
  }
}

function initial() {
  const stored = load();
  if (stored) return stored;
  const math = blankNote("math", "First problem");
  const chemistry = blankNote("chemistry", "First structure");
  return { notes: [math, chemistry], activeNoteId: math.id };
}

export default function useNotebook() {
  const [state, setState] = useState(initial);
  const saveTimer = useRef(null);

  // Debounced so a stroke in progress does not write to disk on every point.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Quota exceeded, private browsing, or storage disabled. The app
        // keeps working in memory; losing persistence must not lose the page.
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  const notes = state.notes;
  const activeNote =
    notes.find((note) => note.id === state.activeNoteId) ?? notes[0];
  const activePage =
    activeNote.pages.find((page) => page.id === activeNote.activePageId) ??
    activeNote.pages[0];

  const folders = useMemo(() => {
    const grouped = { math: [], chemistry: [] };
    for (const note of notes) {
      (grouped[note.subject] ?? grouped.math).push(note);
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return grouped;
  }, [notes]);

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
      setState((current) => {
        const note = current.notes.find((entry) => entry.id === current.activeNoteId);
        if (!note) return current;
        const pageId = note.activePageId ?? note.pages[0].id;
        return {
          ...current,
          notes: current.notes.map((entry) =>
            entry.id !== note.id
              ? entry
              : {
                  ...entry,
                  updatedAt: now(),
                  pages: entry.pages.map((page) =>
                    page.id === pageId ? { ...page, strokes } : page
                  ),
                }
          ),
        };
      });
    },
    []
  );

  const createNote = useCallback(
    (forSubject = "math", title) => {
      const note = blankNote(forSubject, title);
      setState((current) => ({
        notes: [note, ...current.notes].slice(0, MAX_NOTES),
        activeNoteId: note.id,
      }));
      return note;
    },
    []
  );

  const openNote = useCallback((noteId) => {
    setState((current) => ({ ...current, activeNoteId: noteId }));
  }, []);

  const renameNote = useCallback(
    (noteId, title) => update(noteId, { title: title.slice(0, 80) }),
    [update]
  );

  const deleteNote = useCallback((noteId) => {
    setState((current) => {
      const remaining = current.notes.filter((note) => note.id !== noteId);
      if (!remaining.length) {
        const replacement = blankNote("math", "First problem");
        return { notes: [replacement], activeNoteId: replacement.id };
      }
      return {
        notes: remaining,
        activeNoteId:
          current.activeNoteId === noteId ? remaining[0].id : current.activeNoteId,
      };
    });
  }, []);

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
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => {
        if (note.id !== current.activeNoteId) return note;
        const pages = note.pages.filter((page) => page.id !== pageId);
        const kept = pages.length ? pages : [blankPage()];
        return {
          ...note,
          updatedAt: now(),
          pages: kept,
          activePageId: kept[0].id,
        };
      }),
    }));
  }, []);

  // Which lines were flagged and which hints were used, kept with the note
  // so navigating back through past work shows what happened, not just ink.
  const recordOutcome = useCallback(
    (outcome) => update(activeNote.id, { lastVerdict: outcome }),
    [activeNote.id, update]
  );

  return {
    notes,
    folders,
    activeNote,
    activePage,
    pageIndex: activeNote.pages.findIndex((page) => page.id === activePage.id),
    pageCount: activeNote.pages.length,
    saveStrokes,
    createNote,
    openNote,
    renameNote,
    deleteNote,
    addPage,
    openPage,
    deletePage,
    recordOutcome,
  };
}
