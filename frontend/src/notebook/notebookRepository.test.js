import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexedDB } from "fake-indexeddb";

import {
  NotebookPersistenceError,
  NotebookRepository,
  normalizeNotebookState,
  validateNotebookState,
} from "./notebookRepository";

const legacyState = {
  folders: [],
  activeNoteId: "note-1",
  notes: [
    {
      id: "note-1",
      subject: "math",
      title: "Algebra",
      pages: [{ id: "page-1", strokes: [{ points: [{ x: 1, y: 2 }] }] }],
      activePageId: "page-1",
    },
  ],
};

function storageWith(value) {
  return { getItem: () => value };
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("verity.notebook");
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = resolve;
  });
}

const repositories = [];
function makeRepository(storage) {
  const repository = new NotebookRepository({ indexedDB, storage });
  repositories.push(repository);
  return repository;
}

describe("NotebookRepository", () => {
  beforeEach(async () => {
    for (const repository of repositories.splice(0)) repository.close();
    await deleteDatabase();
  });

  afterEach(() => {
    for (const repository of repositories.splice(0)) repository.close();
  });

  it("migrates localStorage once without duplicating notes", async () => {
    const storage = storageWith(JSON.stringify(legacyState));
    const first = await makeRepository(storage).load();
    const second = await makeRepository(storage).load();

    expect(first.notes).toHaveLength(1);
    expect(second.notes).toHaveLength(1);
    expect(second.notes[0].pages[0].strokes).toEqual(legacyState.notes[0].pages[0].strokes);
  });

  it("writes page strokes and workflow separately from note metadata", async () => {
    const repository = makeRepository(storageWith(null));
    const state = await repository.load();
    const note = state.notes[0];
    const page = {
      ...note.pages[0],
      strokes: [{ id: "stroke-1", points: [{ x: 8, y: 9 }] }],
      workflowSnapshot: { schemaVersion: 1, subject: note.subject, hintLevel: 2 },
    };

    await repository.savePage({ noteId: note.id, page });
    const loaded = await repository.load();
    expect(loaded.notes.find((entry) => entry.id === note.id).pages[0]).toMatchObject({
      strokes: page.strokes,
      workflowSnapshot: page.workflowSnapshot,
    });
  });

  it("normalizes legacy titles, page IDs, defaults, and active references", () => {
    const state = normalizeNotebookState({
      activeNoteId: "legacy-note",
      notes: [{ id: "legacy-note", subject: "chemistry", title: "First structure", pages: [{ id: "legacy-page", strokes: [] }] }],
    }, { migrateSeededTitles: true });

    expect(state.notes[0].title).toBe("Chemistry 1");
    expect(state.notes[0].activePageId).toBe("legacy-page");
    expect(state.notes[0].folderId).toBe(null);
    expect(normalizeNotebookState(state, { migrateSeededTitles: true })).toEqual(state);
  });

  it("round-trips a multi-page note with workflows and removes all orphan records", async () => {
    const repository = makeRepository(storageWith(null));
    const state = await repository.load();
    const source = state.notes[0];
    const copy = {
      ...source,
      id: "copy-note",
      title: "Copy",
      activePageId: "copy-page-2",
      pages: [
        { id: "copy-page-1", strokes: [{ points: [{ x: 1, y: 1 }] }], workflowSnapshot: { subject: source.subject, recognizedLines: [], verdictsByLine: [] } },
        { id: "copy-page-2", strokes: [{ points: [{ x: 2, y: 2 }] }], workflowSnapshot: { subject: source.subject, recognizedLines: [], verdictsByLine: [] } },
      ],
    };
    await repository.saveNoteTree(copy);
    const loaded = await repository.load();
    expect(loaded.notes.find((note) => note.id === copy.id)).toMatchObject(copy);

    await repository.deleteNoteTree(copy.id);
    const afterDelete = await repository.load();
    expect(afterDelete.notes.some((note) => note.id === copy.id)).toBe(false);
    expect(afterDelete.notes.flatMap((note) => note.pages).some((page) => page.id.startsWith("copy-page"))).toBe(false);
  });

  it("rejects malformed imports before changing existing data", async () => {
    const repository = makeRepository(storageWith(null));
    const before = await repository.load();
    const malformed = { folders: [], activeNoteId: "n1", notes: [{ id: "n1", subject: "math", pages: [] }] };

    expect(() => validateNotebookState(malformed)).toThrow(NotebookPersistenceError);
    await expect(repository.importData(malformed)).rejects.toBeInstanceOf(NotebookPersistenceError);
    await expect(repository.load()).resolves.toEqual(before);
  });
});
