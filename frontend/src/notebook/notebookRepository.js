const DB_NAME = "verity.notebook";
const DB_VERSION = 1;
const LEGACY_STORAGE_KEY = "verity.notebook.v1";
const ROOT_KEY = "root";
const MIGRATION_KEY = "legacy-localstorage-v1";

const STORE_NAMES = [
  "metadata",
  "notebooks",
  "folders",
  "notes",
  "pages",
  "strokes",
  "workflows",
];

export class NotebookPersistenceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "NotebookPersistenceError";
    this.cause = cause;
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
  });
}

function stripStrokes(page) {
  const metadata = { ...page };
  delete metadata.strokes;
  delete metadata.workflowSnapshot;
  return metadata;
}

function pageRecord(noteId, page) {
  return { ...stripStrokes(page), noteId };
}

function noteRecord(note) {
  const metadata = { ...note };
  delete metadata.pages;
  return metadata;
}

function makeDefaultState() {
  const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const page = (subject) => ({ id: id(`${subject}-page`), strokes: [], workflowSnapshot: null });
  const mathPage = page("math");
  const chemistryPage = page("chemistry");
  const math = {
    id: id("math-note"),
    subject: "math",
    folderId: null,
    title: "Math 1",
    pages: [mathPage],
    activePageId: mathPage.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastVerdict: null,
    hintsUsed: 0,
  };
  const chemistry = {
    id: id("chemistry-note"),
    subject: "chemistry",
    folderId: null,
    title: "Chemistry 1",
    pages: [chemistryPage],
    activePageId: chemistryPage.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastVerdict: null,
    hintsUsed: 0,
  };
  return { folders: [], notes: [math, chemistry], activeNoteId: math.id };
}

function getLegacyStorage(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(LEGACY_STORAGE_KEY) ?? null;
  } catch (error) {
    throw new NotebookPersistenceError("Could not read the existing notebook data.", error);
  }
}

export function readLegacyNotebook(storage = globalThis.localStorage) {
  const raw = getLegacyStorage(storage);
  if (!raw) return { state: null, raw: null, error: null };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.notes) || parsed.notes.length === 0) {
      return { state: null, raw, error: new NotebookPersistenceError("The existing notebook data is not valid.") };
    }
    return { state: parsed, raw, error: null };
  } catch (error) {
    return {
      state: null,
      raw,
      error: new NotebookPersistenceError("The existing notebook data could not be decoded.", error),
    };
  }
}

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) {
    return Promise.reject(new NotebookPersistenceError("IndexedDB is not available in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of STORE_NAMES) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new NotebookPersistenceError("Notebook storage could not be opened.", request.error));
    request.onblocked = () => reject(new NotebookPersistenceError("Notebook storage is blocked by another tab."));
  });
}

export class NotebookRepository {
  constructor({ indexedDB = globalThis.indexedDB, storage = globalThis.localStorage } = {}) {
    this.indexedDB = indexedDB;
    this.storage = storage;
    this.database = null;
    this.ready = null;
  }

  async open() {
    if (!this.ready) {
      this.ready = openDatabase(this.indexedDB).then(async (database) => {
        this.database = database;
        await this.migrateLegacyIfNeeded();
        return this;
      });
    }
    return this.ready;
  }

  async migrateLegacyIfNeeded() {
    const transaction = this.database.transaction(STORE_NAMES, "readonly");
    const done = transactionDone(transaction);
    const marker = await requestResult(transaction.objectStore("metadata").get(MIGRATION_KEY));
    const root = await requestResult(transaction.objectStore("metadata").get(ROOT_KEY));
    await done;
    if (marker || root) return;

    const legacy = readLegacyNotebook(this.storage);
    if (legacy.error) throw legacy.error;
    if (legacy.state) {
      await this.replaceAll(legacy.state);
    } else {
      await this.replaceAll(makeDefaultState());
    }

    const migration = this.database.transaction("metadata", "readwrite");
    const migrationDone = transactionDone(migration);
    migration.objectStore("metadata").put({ key: MIGRATION_KEY, completedAt: Date.now() }, MIGRATION_KEY);
    await migrationDone;
  }

  async load() {
    await this.open();
    const transaction = this.database.transaction(STORE_NAMES, "readonly");
    const done = transactionDone(transaction);
    const [root, folders, notes, pages, strokes, workflows] = await Promise.all([
      requestResult(transaction.objectStore("metadata").get(ROOT_KEY)),
      requestResult(transaction.objectStore("folders").getAll()),
      requestResult(transaction.objectStore("notes").getAll()),
      requestResult(transaction.objectStore("pages").getAll()),
      requestResult(transaction.objectStore("strokes").getAll()),
      requestResult(transaction.objectStore("workflows").getAll()),
    ]);
    await done;
    if (!root) return null;

    const strokeByPage = new Map(strokes.map((record) => [record.pageId, record.strokes ?? []]));
    const workflowByPage = new Map(workflows.map((record) => [record.pageId, record.snapshot ?? null]));
    const pagesByNote = new Map();
    for (const record of pages) {
      const page = {
        ...record,
        strokes: strokeByPage.get(record.id) ?? [],
        workflowSnapshot: workflowByPage.get(record.id) ?? null,
      };
      delete page.noteId;
      (pagesByNote.get(record.noteId) ?? pagesByNote.set(record.noteId, []).get(record.noteId)).push(page);
    }
    return {
      folders,
      notes: notes.map((note) => ({ ...note, pages: pagesByNote.get(note.id) ?? [] })),
      activeNoteId: root.activeNoteId,
    };
  }

  close() {
    this.database?.close();
    this.database = null;
    this.ready = null;
  }

  async replaceAll(state) {
    if (!this.database) await this.open();
    const transaction = this.database.transaction(STORE_NAMES, "readwrite");
    const done = transactionDone(transaction);
    for (const name of STORE_NAMES) transaction.objectStore(name).clear();
    transaction.objectStore("metadata").put({ key: ROOT_KEY, version: 1, activeNoteId: state.activeNoteId }, ROOT_KEY);
    for (const folder of state.folders ?? []) transaction.objectStore("folders").put(folder, folder.id);
    for (const note of state.notes ?? []) {
      transaction.objectStore("notes").put(noteRecord(note), note.id);
      for (const page of note.pages ?? []) {
        transaction.objectStore("pages").put(pageRecord(note.id, page), page.id);
        transaction.objectStore("strokes").put({ pageId: page.id, strokes: page.strokes ?? [] }, page.id);
        if (page.workflowSnapshot) {
          transaction.objectStore("workflows").put({ pageId: page.id, snapshot: page.workflowSnapshot }, page.id);
        }
      }
    }
    await done;
  }

  async saveMetadata(state) {
    await this.open();
    const transaction = this.database.transaction(["metadata", "folders", "notes", "pages"], "readwrite");
    const done = transactionDone(transaction);
    const foldersStore = transaction.objectStore("folders");
    const notesStore = transaction.objectStore("notes");
    const pagesStore = transaction.objectStore("pages");
    foldersStore.clear();
    notesStore.clear();
    pagesStore.clear();
    for (const folder of state.folders ?? []) foldersStore.put(folder, folder.id);
    for (const note of state.notes ?? []) {
      notesStore.put(noteRecord(note), note.id);
      for (const page of note.pages ?? []) pagesStore.put(pageRecord(note.id, page), page.id);
    }
    transaction.objectStore("metadata").put({ key: ROOT_KEY, version: 1, activeNoteId: state.activeNoteId }, ROOT_KEY);
    await done;
  }

  async savePage({ noteId, page }) {
    await this.open();
    const transaction = this.database.transaction(["pages", "strokes", "workflows"], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("pages").put(pageRecord(noteId, page), page.id);
    transaction.objectStore("strokes").put({ pageId: page.id, strokes: page.strokes ?? [] }, page.id);
    const workflowStore = transaction.objectStore("workflows");
    if (page.workflowSnapshot) workflowStore.put({ pageId: page.id, snapshot: page.workflowSnapshot }, page.id);
    else workflowStore.delete(page.id);
    await done;
  }

  async deletePage(pageId) {
    await this.open();
    const transaction = this.database.transaction(["pages", "strokes", "workflows"], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("pages").delete(pageId);
    transaction.objectStore("strokes").delete(pageId);
    transaction.objectStore("workflows").delete(pageId);
    await done;
  }

  async exportData() {
    const state = await this.load();
    return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), state }, null, 2);
  }

  async importData(serialized) {
    let parsed;
    try {
      parsed = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
    } catch (error) {
      throw new NotebookPersistenceError("That notebook export is not valid JSON.", error);
    }
    const state = parsed?.state ?? parsed;
    if (!state || !Array.isArray(state.notes) || !state.notes.length) {
      throw new NotebookPersistenceError("That notebook export does not contain any notes.");
    }
    await this.replaceAll(state);
    return state;
  }
}

export function createNotebookRepository(options) {
  return new NotebookRepository(options);
}

export { LEGACY_STORAGE_KEY };
