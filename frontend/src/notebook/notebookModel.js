const timestamp = () => Date.now();

export const createNotebookId = (prefix = "id") =>
  `${prefix}-${timestamp().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createBlankPage(subject = "math", idFactory = createNotebookId) {
  return { id: idFactory(`${subject}-page`), strokes: [], workflowSnapshot: null };
}

export function createBlankNote(subject, title, folderId = null, idFactory = createNotebookId) {
  const page = createBlankPage(subject, idFactory);
  const createdAt = timestamp();
  return {
    id: idFactory(`${subject}-note`),
    subject,
    folderId,
    title: title || (subject === "chemistry" ? "Chemistry" : "Math"),
    pages: [page],
    activePageId: page.id,
    createdAt,
    updatedAt: createdAt,
    lastVerdict: null,
    hintsUsed: 0,
  };
}

export function duplicateNoteRecord(source, idFactory = createNotebookId) {
  const pageIds = new Map();
  const pages = (source.pages ?? []).map((page) => {
    const id = idFactory(`${source.subject}-page`);
    pageIds.set(page.id, id);
    return { ...clone(page), id };
  });
  const copiedPages = pages.length ? pages : [createBlankPage(source.subject, idFactory)];
  return {
    ...clone(source),
    id: idFactory(`${source.subject}-note`),
    title: `${source.title} copy`.slice(0, 80),
    createdAt: timestamp(),
    updatedAt: timestamp(),
    pages: copiedPages,
    activePageId: pageIds.get(source.activePageId) ?? copiedPages[0].id,
  };
}
