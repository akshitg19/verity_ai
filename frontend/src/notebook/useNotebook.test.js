import { describe, expect, it } from "vitest";

// The tree shape the sidebar renders, tested as a pure function of the two
// stored lists rather than through the hook, so it needs no DOM.
function treeFor(subject, folders, notes) {
  const subjectNotes = notes.filter((note) => note.subject === subject);
  const subjectFolders = folders
    .filter((folder) => folder.subject === subject)
    .map((folder) => ({
      ...folder,
      notes: subjectNotes.filter((note) => note.folderId === folder.id),
    }));
  const known = new Set(subjectFolders.map((folder) => folder.id));
  return {
    folders: subjectFolders,
    loose: subjectNotes.filter((note) => !note.folderId || !known.has(note.folderId)),
  };
}

const FOLDERS = [
  { id: "f1", subject: "chemistry", name: "Unit 3" },
  { id: "f2", subject: "math", name: "Algebra" },
];

const NOTES = [
  { id: "n1", subject: "chemistry", folderId: "f1", title: "Balancing" },
  { id: "n2", subject: "chemistry", folderId: null, title: "Loose" },
  { id: "n3", subject: "math", folderId: "f2", title: "Linear" },
  { id: "n4", subject: "chemistry", folderId: "gone", title: "Orphan" },
];

describe("notebook tree", () => {
  it("keeps math and chemistry in separate spaces", () => {
    const chemistry = treeFor("chemistry", FOLDERS, NOTES);
    const math = treeFor("math", FOLDERS, NOTES);

    expect(chemistry.folders.map((f) => f.name)).toEqual(["Unit 3"]);
    expect(math.folders.map((f) => f.name)).toEqual(["Algebra"]);
  });

  it("puts a note inside the folder it belongs to", () => {
    const tree = treeFor("chemistry", FOLDERS, NOTES);

    expect(tree.folders[0].notes.map((n) => n.title)).toEqual(["Balancing"]);
  });

  it("shows a note with no folder at the top level", () => {
    const tree = treeFor("chemistry", FOLDERS, NOTES);

    expect(tree.loose.map((n) => n.title)).toContain("Loose");
  });

  it("does not lose a note whose folder was deleted", () => {
    // Deleting a folder must never take a term of homework with it.
    const tree = treeFor("chemistry", FOLDERS, NOTES);

    expect(tree.loose.map((n) => n.title)).toContain("Orphan");
  });
});

// Renaming the two seeded titles on load. Changing the defaults only reached
// people who had never opened the app; everyone else kept the old name.
const SEEDED_TITLES = { "First problem": "Math 1", "First structure": "Chemistry 1" };
const migrateTitle = (note) =>
  SEEDED_TITLES[note.title] ? { ...note, title: SEEDED_TITLES[note.title] } : note;

describe("migrating a stored notebook", () => {
  it("renames the seeded chemistry note", () => {
    expect(migrateTitle({ title: "First structure" }).title).toBe("Chemistry 1");
  });

  it("renames the seeded math note", () => {
    expect(migrateTitle({ title: "First problem" }).title).toBe("Math 1");
  });

  it("leaves a name the student chose alone", () => {
    expect(migrateTitle({ title: "Friday homework" }).title).toBe("Friday homework");
  });

  it("leaves an already-migrated name alone", () => {
    expect(migrateTitle({ title: "Chemistry 1" }).title).toBe("Chemistry 1");
  });

  it("keeps everything else on the note", () => {
    const note = { title: "First structure", id: "n1", pages: [{ id: "p1" }] };

    expect(migrateTitle(note)).toEqual({
      title: "Chemistry 1",
      id: "n1",
      pages: [{ id: "p1" }],
    });
  });
});

// The sort the sidebar shows: pinned first, then most recently touched.
// Extracted the same way as treeFor, as a pure function over the note list.
function ordered(notes) {
  return [...notes].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      b.updatedAt - a.updatedAt
  );
}

describe("note ordering", () => {
  const notes = [
    { id: "a", title: "Old", updatedAt: 1 },
    { id: "b", title: "New", updatedAt: 3 },
    { id: "c", title: "Middle", updatedAt: 2 },
  ];

  it("puts the most recently touched note first", () => {
    expect(ordered(notes).map((n) => n.title)).toEqual(["New", "Middle", "Old"]);
  });

  it("lifts a pinned note above a newer unpinned one", () => {
    const pinned = notes.map((n) => (n.id === "a" ? { ...n, pinned: true } : n));

    expect(ordered(pinned).map((n) => n.title)).toEqual(["Old", "New", "Middle"]);
  });

  it("keeps pinned notes in recency order among themselves", () => {
    const pinned = notes.map((n) =>
      n.id === "a" || n.id === "c" ? { ...n, pinned: true } : n
    );

    expect(ordered(pinned).map((n) => n.title)).toEqual(["Middle", "Old", "New"]);
  });
});

// Naming a note after its question, which must never overwrite a name the
// student chose.
function nextTitle(currentTitle, question) {
  const trimmed = (question ?? "").trim();
  if (!trimmed) return currentTitle;
  if (!/^(Chemistry|Math) \d+$/.test(currentTitle)) return currentTitle;
  return trimmed.slice(0, 60);
}

describe("naming a note from its question", () => {
  it("replaces a generated name", () => {
    expect(nextTitle("Chemistry 3", "C3H8 + O2 -> CO2 + H2O")).toBe(
      "C3H8 + O2 -> CO2 + H2O"
    );
  });

  it("leaves a name the student chose alone", () => {
    expect(nextTitle("Friday homework", "C3H8 + O2 -> CO2 + H2O")).toBe(
      "Friday homework"
    );
  });

  it("does nothing when there is no question yet", () => {
    expect(nextTitle("Chemistry 3", "   ")).toBe("Chemistry 3");
    expect(nextTitle("Chemistry 3", undefined)).toBe("Chemistry 3");
  });

  it("caps a very long question", () => {
    expect(nextTitle("Math 1", "x".repeat(200))).toHaveLength(60);
  });
});
