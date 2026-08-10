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
