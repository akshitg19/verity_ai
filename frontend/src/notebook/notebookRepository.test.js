import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexedDB } from "fake-indexeddb";

import { NotebookRepository } from "./notebookRepository";

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
});
