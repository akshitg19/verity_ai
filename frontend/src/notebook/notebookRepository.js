import { serializeWorkflowSnapshot } from "./workflowSnapshot";

const DB_NAME = "verity.notebook";
const DB_VERSION = 2;
const LEGACY_STORAGE_KEY = "verity.notebook.v1";
const ROOT_KEY = "root";
const MIGRATION_KEY = "legacy-localstorage-v1";

export const NOTEBOOK_SCHEMA_VERSION = 2;
export const SUPPORTED_SUBJECTS = new Set(["math", "chemistry"]);

const STORE_NAMES = [
  "metadata",
  "notebooks",
  "folders",
  "notes",
  "pages",
  "strokes",
  "workflows",
];

const SEEDED_TITLES = {
  "First problem": "Math 1",
  "First structure": "Chemistry 1",
};

export class NotebookPersistenceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "NotebookPersistenceError";
    this.cause = cause;
  }
}

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const generatedId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

function blankPage(subject, idFactory) {
  return { id: idFactory(`${subject}-page`), strokes: [], workflowSnapshot: null };
}

function blankNote(subject, idFactory) {
  const page = blankPage(subject, idFactory);
  const timestamp = Date.now();
  return {
    id: idFactory(`${subject}-note`),
    subject,
    folderId: null,
    title: subject === "chemistry" ? "Chemistry 1" : "Math 1",
    pages: [page],
    activePageId: page.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastVerdict: null,
    hintsUsed: 0,
  };
}

export function createDefaultNotebookState(idFactory = generatedId) {
  const math = blankNote("math", idFactory);
  const chemistry = blankNote("chemistry", idFactory);
  return {
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    folders: [],
    notes: [math, chemistry],
    activeNoteId: math.id,
  };
}

export function migrateSeededTitle(note) {
  const renamed = SEEDED_TITLES[note?.title];
  return renamed ? { ...note, title: renamed } : note;
}

function normaliseStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes.filter((stroke) => {
    if (!stroke || typeof stroke !== "object" || !Array.isArray(stroke.points)) return false;
    return stroke.points.every(
      (point) => point && isFiniteNumber(point.x) && isFiniteNumber(point.y)
    );
  }).map(clone);
}

function normaliseWorkflow(snapshot, subject) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const serialised = serializeWorkflowSnapshot({ ...snapshot, subject, mode: subject });
  return serialised.subject === subject ? serialised : null;
}

/**
 * Convert legacy or already-persisted notebook data to one canonical shape.
 * This is the production migration path; tests should exercise this function
 * rather than copying its rules into test fixtures.
 */
export function normalizeNotebookState(rawState, { migrateSeededTitles = false } = {}) {
  const source = rawState && typeof rawState === "object" ? rawState : {};
  const usedIds = new Set();
  const idFactory = (prefix) => {
    let id = generatedId(prefix);
    while (usedIds.has(id)) id = generatedId(prefix);
    usedIds.add(id);
    return id;
  };

  const folders = (Array.isArray(source.folders) ? source.folders : [])
    .filter((folder) => folder && SUPPORTED_SUBJECTS.has(folder.subject))
    .map((folder) => ({
      ...clone(folder),
      id: typeof folder.id === "string" && !usedIds.has(folder.id)
        ? (usedIds.add(folder.id), folder.id)
        : idFactory("folder"),
      name: String(folder.name || "New folder").slice(0, 60),
      createdAt: Number.isFinite(folder.createdAt) ? folder.createdAt : Date.now(),
    }));
  const folderIds = new Set(folders.map((folder) => folder.id));

  const rawNotes = Array.isArray(source.notes) ? source.notes : [];
  const notes = rawNotes.map((rawNote) => {
    const subject = SUPPORTED_SUBJECTS.has(rawNote?.subject) ? rawNote.subject : "math";
    const noteId = typeof rawNote?.id === "string" && !usedIds.has(rawNote.id)
      ? (usedIds.add(rawNote.id), rawNote.id)
      : idFactory(`${subject}-note`);
    const rawPages = Array.isArray(rawNote?.pages) ? rawNote.pages : [];
    const pages = (rawPages.length ? rawPages : [blankPage(subject, idFactory)]).map((rawPage) => {
      const pageId = typeof rawPage?.id === "string" && !usedIds.has(rawPage.id)
        ? (usedIds.add(rawPage.id), rawPage.id)
        : idFactory(`${subject}-page`);
      return {
        ...clone(rawPage),
        id: pageId,
        strokes: normaliseStrokes(rawPage?.strokes),
        workflowSnapshot: normaliseWorkflow(rawPage?.workflowSnapshot, subject),
      };
    });
    const requestedActivePageId = rawNote?.activePageId;
    const activePageId = pages.some((page) => page.id === requestedActivePageId)
      ? requestedActivePageId
      : pages[0].id;
    const note = {
      ...clone(rawNote),
      id: noteId,
      subject,
      folderId: folderIds.has(rawNote?.folderId) ? rawNote.folderId : null,
      title: String(rawNote?.title || (subject === "chemistry" ? "Chemistry" : "Math")).slice(0, 80),
      pages,
      activePageId,
      createdAt: Number.isFinite(rawNote?.createdAt) ? rawNote.createdAt : Date.now(),
      updatedAt: Number.isFinite(rawNote?.updatedAt) ? rawNote.updatedAt : Date.now(),
      lastVerdict: rawNote?.lastVerdict ?? null,
      hintsUsed: Number.isFinite(rawNote?.hintsUsed) ? rawNote.hintsUsed : 0,
    };
    return migrateSeededTitles && (note.title === "First problem" || note.title === "First structure")
      ? migrateSeededTitle(note)
      : note;
  });

  const finalNotes = notes.length ? notes : [blankNote("math", idFactory), blankNote("chemistry", idFactory)];
  const requestedActiveNoteId = source.activeNoteId;
  const activeNoteId = finalNotes.some((note) => note.id === requestedActiveNoteId)
    ? requestedActiveNoteId
    : finalNotes[0].id;

  return {
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    folders,
    notes: finalNotes,
    activeNoteId,
  };
}

function validationFailure(message) {
  throw new NotebookPersistenceError(`That notebook export is invalid: ${message}`);
}

function validateStrokeCollection(strokes, path) {
  if (!Array.isArray(strokes)) validationFailure(`${path}.strokes must be an array.`);
  for (const [strokeIndex, stroke] of strokes.entries()) {
    if (!stroke || typeof stroke !== "object" || !Array.isArray(stroke.points)) {
      validationFailure(`${path}.strokes[${strokeIndex}] is not a valid stroke.`);
    }
    if (stroke.points.some((point) => !point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y))) {
      validationFailure(`${path}.strokes[${strokeIndex}] contains invalid coordinates.`);
    }
  }
}

/** Validate without repairing: imports must be rejected, not silently changed. */
export function validateNotebookState(state) {
  if (!state || typeof state !== "object") validationFailure("state must be an object.");
  if (state.schemaVersion !== undefined && (!Number.isInteger(state.schemaVersion) || state.schemaVersion > NOTEBOOK_SCHEMA_VERSION)) {
    validationFailure("the schema version is not supported.");
  }
  if (!Array.isArray(state.notes) || state.notes.length === 0) validationFailure("notes must be a non-empty array.");
  if (!Array.isArray(state.folders)) validationFailure("folders must be an array.");

  const folderIds = new Set();
  for (const folder of state.folders) {
    if (!folder || typeof folder.id !== "string" || folderIds.has(folder.id)) validationFailure("folder IDs must be unique strings.");
    if (!SUPPORTED_SUBJECTS.has(folder.subject)) validationFailure("folders contain an unsupported subject.");
    folderIds.add(folder.id);
  }

  const noteIds = new Set();
  const pageIds = new Set();
  for (const [noteIndex, note] of state.notes.entries()) {
    if (!note || typeof note.id !== "string" || noteIds.has(note.id)) validationFailure(`notes[${noteIndex}] has a duplicate or invalid ID.`);
    if (!SUPPORTED_SUBJECTS.has(note.subject)) validationFailure(`notes[${noteIndex}] has an unsupported subject.`);
    if (note.folderId !== null && note.folderId !== undefined && !folderIds.has(note.folderId)) validationFailure(`notes[${noteIndex}] references a missing folder.`);
    if (!Array.isArray(note.pages) || note.pages.length === 0) validationFailure(`notes[${noteIndex}] must have at least one page.`);
    noteIds.add(note.id);
    const notePageIds = new Set();
    for (const [pageIndex, page] of note.pages.entries()) {
      if (!page || typeof page.id !== "string" || pageIds.has(page.id) || notePageIds.has(page.id)) validationFailure(`notes[${noteIndex}].pages[${pageIndex}] has a duplicate or invalid ID.`);
      validateStrokeCollection(page.strokes, `notes[${noteIndex}].pages[${pageIndex}]`);
      if (page.workflowSnapshot !== null && page.workflowSnapshot !== undefined) {
        if (typeof page.workflowSnapshot !== "object" || page.workflowSnapshot.subject !== note.subject) {
          validationFailure(`notes[${noteIndex}].pages[${pageIndex}] has an invalid workflow snapshot.`);
        }
        if (page.workflowSnapshot.recognizedLines !== undefined && !Array.isArray(page.workflowSnapshot.recognizedLines)) {
          validationFailure(`notes[${noteIndex}].pages[${pageIndex}] has invalid recognized lines.`);
        }
        if (page.workflowSnapshot.verdictsByLine !== undefined && !Array.isArray(page.workflowSnapshot.verdictsByLine)) {
          validationFailure(`notes[${noteIndex}].pages[${pageIndex}] has invalid verdict data.`);
        }
      }
      pageIds.add(page.id);
      notePageIds.add(page.id);
    }
    if (typeof note.activePageId !== "string" || !notePageIds.has(note.activePageId)) validationFailure(`notes[${noteIndex}] has an invalid activePageId.`);
  }
  if (typeof state.activeNoteId !== "string" || !noteIds.has(state.activeNoteId)) validationFailure("activeNoteId does not reference a note.");
  return true;
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

function stripPageContent(page) {
  const metadata = { ...clone(page) };
  delete metadata.strokes;
  delete metadata.workflowSnapshot;
  return metadata;
}

function pageRecord(noteId, page) {
  return { ...stripPageContent(page), noteId };
}

function noteRecord(note) {
  const metadata = { ...clone(note) };
  delete metadata.pages;
  return metadata;
}

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return Promise.reject(new NotebookPersistenceError("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of STORE_NAMES) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
      }
      const pages = request.transaction.objectStore("pages");
      if (!pages.indexNames.contains("byNoteId")) pages.createIndex("byNoteId", "noteId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new NotebookPersistenceError("Notebook storage could not be opened.", request.error));
    request.onblocked = () => reject(new NotebookPersistenceError("Notebook storage is blocked by another tab."));
  });
}

function writePageRecords(transaction, note) {
  const pagesStore = transaction.objectStore("pages");
  const strokesStore = transaction.objectStore("strokes");
  const workflowsStore = transaction.objectStore("workflows");
  for (const page of note.pages ?? []) {
    pagesStore.put(pageRecord(note.id, page), page.id);
    strokesStore.put({ pageId: page.id, strokes: clone(page.strokes ?? []) }, page.id);
    if (page.workflowSnapshot) workflowsStore.put({ pageId: page.id, snapshot: clone(page.workflowSnapshot) }, page.id);
    else workflowsStore.delete(page.id);
  }
}

function removeMissingPageRecords(transaction, noteId, currentPageIds) {
  const index = transaction.objectStore("pages").index("byNoteId");
  index.openCursor(noteId).onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;
    if (!currentPageIds.has(cursor.primaryKey)) {
      transaction.objectStore("strokes").delete(cursor.primaryKey);
      transaction.objectStore("workflows").delete(cursor.primaryKey);
      cursor.delete();
    }
    cursor.continue();
  };
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
    const transaction = this.database.transaction(["metadata"], "readonly");
    const done = transactionDone(transaction);
    const marker = await requestResult(transaction.objectStore("metadata").get(MIGRATION_KEY));
    const root = await requestResult(transaction.objectStore("metadata").get(ROOT_KEY));
    await done;
    if (marker?.schemaVersion >= NOTEBOOK_SCHEMA_VERSION && root) return;

    const legacy = readLegacyNotebook(this.storage);
    if (legacy.error) throw legacy.error;
    const migrated = normalizeNotebookState(legacy.state ?? createDefaultNotebookState(), { migrateSeededTitles: true });
    await this.replaceAll(migrated);

    const migration = this.database.transaction("metadata", "readwrite");
    const migrationDone = transactionDone(migration);
    migration.objectStore("metadata").put({ key: MIGRATION_KEY, schemaVersion: NOTEBOOK_SCHEMA_VERSION, completedAt: Date.now() }, MIGRATION_KEY);
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
      const list = pagesByNote.get(record.noteId) ?? [];
      list.push(page);
      pagesByNote.set(record.noteId, list);
    }
    return normalizeNotebookState({
      schemaVersion: root.version,
      folders,
      notes: notes.map((note) => ({ ...note, pages: pagesByNote.get(note.id) ?? [] })),
      activeNoteId: root.activeNoteId,
    });
  }

  close() {
    this.database?.close();
    this.database = null;
    this.ready = null;
  }

  async replaceAll(state) {
    if (!this.database) await this.open();
    const canonical = normalizeNotebookState(state);
    const transaction = this.database.transaction(STORE_NAMES, "readwrite");
    const done = transactionDone(transaction);
    for (const name of STORE_NAMES) transaction.objectStore(name).clear();
    transaction.objectStore("metadata").put({ key: ROOT_KEY, version: NOTEBOOK_SCHEMA_VERSION, activeNoteId: canonical.activeNoteId }, ROOT_KEY);
    for (const folder of canonical.folders ?? []) transaction.objectStore("folders").put(clone(folder), folder.id);
    for (const note of canonical.notes ?? []) {
      transaction.objectStore("notes").put(noteRecord(note), note.id);
      writePageRecords(transaction, note);
    }
    await done;
  }

  async saveRoot(activeNoteId) {
    await this.open();
    const transaction = this.database.transaction("metadata", "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("metadata").put({ key: ROOT_KEY, version: NOTEBOOK_SCHEMA_VERSION, activeNoteId }, ROOT_KEY);
    await done;
  }

  async saveFolder(folder) {
    await this.open();
    const transaction = this.database.transaction("folders", "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("folders").put(clone(folder), folder.id);
    await done;
  }

  async deleteFolder(folderId) {
    await this.open();
    const transaction = this.database.transaction("folders", "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("folders").delete(folderId);
    await done;
  }

  async saveNoteMetadata(note) {
    await this.open();
    const transaction = this.database.transaction(["notes", "pages", "strokes", "workflows"], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("notes").put(noteRecord(note), note.id);
    removeMissingPageRecords(transaction, note.id, new Set((note.pages ?? []).map((page) => page.id)));
    for (const page of note.pages ?? []) transaction.objectStore("pages").put(pageRecord(note.id, page), page.id);
    await done;
  }

  async saveNoteTree(note) {
    await this.open();
    const transaction = this.database.transaction(["notes", "pages", "strokes", "workflows"], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("notes").put(noteRecord(note), note.id);
    removeMissingPageRecords(transaction, note.id, new Set((note.pages ?? []).map((page) => page.id)));
    writePageRecords(transaction, note);
    await done;
  }

  async deleteNoteTree(noteId) {
    await this.open();
    const transaction = this.database.transaction(["notes", "pages", "strokes", "workflows"], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("notes").delete(noteId);
    const cursorRequest = transaction.objectStore("pages").index("byNoteId").openCursor(noteId);
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      transaction.objectStore("strokes").delete(cursor.primaryKey);
      transaction.objectStore("workflows").delete(cursor.primaryKey);
      cursor.delete();
      cursor.continue();
    };
    await done;
  }

  async savePage({ noteId, page }) {
    await this.open();
    const transaction = this.database.transaction(["pages", "strokes", "workflows"], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("pages").put(pageRecord(noteId, page), page.id);
    transaction.objectStore("strokes").put({ pageId: page.id, strokes: clone(page.strokes ?? []) }, page.id);
    if (page.workflowSnapshot) transaction.objectStore("workflows").put({ pageId: page.id, snapshot: clone(page.workflowSnapshot) }, page.id);
    else transaction.objectStore("workflows").delete(page.id);
    await done;
  }

  async deletePageAndUpdateNote({ note, pageId }) {
    await this.open();
    const transaction = this.database.transaction(["notes", "pages", "strokes", "workflows"], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("notes").put(noteRecord(note), note.id);
    transaction.objectStore("pages").delete(pageId);
    transaction.objectStore("strokes").delete(pageId);
    transaction.objectStore("workflows").delete(pageId);
    await done;
  }

  async restorePageAndUpdateNote({ note, page }) {
    await this.open();
    const transaction = this.database.transaction(["notes", "pages", "strokes", "workflows"], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore("notes").put(noteRecord(note), note.id);
    writePageRecords(transaction, { ...note, pages: [page] });
    await done;
  }

  async exportData() {
    const state = await this.load();
    return JSON.stringify({ schemaVersion: NOTEBOOK_SCHEMA_VERSION, exportedAt: new Date().toISOString(), state }, null, 2);
  }

  async importData(serialized) {
    let parsed;
    try {
      parsed = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
    } catch (error) {
      throw new NotebookPersistenceError("That notebook export is not valid JSON.", error);
    }
    const state = parsed?.state ?? parsed;
    validateNotebookState(state);
    const canonical = normalizeNotebookState(state, { migrateSeededTitles: false });
    await this.replaceAll(canonical);
    return canonical;
  }
}

export function getLegacyStorage(storage = globalThis.localStorage) {
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
    return { state: null, raw, error: new NotebookPersistenceError("The existing notebook data could not be decoded.", error) };
  }
}

export function createNotebookRepository(options) {
  return new NotebookRepository(options);
}

export { LEGACY_STORAGE_KEY };
