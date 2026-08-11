import { describe, expect, it } from "vitest";

import { duplicateNoteRecord } from "./notebookModel";

describe("notebook note duplication", () => {
  it("copies every page and remaps the active page without sharing records", () => {
    const source = {
      id: "note-source",
      subject: "chemistry",
      title: "H2O",
      activePageId: "page-2",
      pages: [
        { id: "page-1", strokes: [{ points: [{ x: 1, y: 2 }] }], workflowSnapshot: { subject: "chemistry", hintLevel: 1 } },
        { id: "page-2", strokes: [{ points: [{ x: 3, y: 4 }] }], workflowSnapshot: { subject: "chemistry", hintLevel: 2 } },
      ],
    };
    let counter = 0;
    const copy = duplicateNoteRecord(source, (prefix) => `${prefix}-${++counter}`);

    expect(copy.id).not.toBe(source.id);
    expect(copy.pages).toHaveLength(2);
    expect(copy.pages.map((page) => page.id)).not.toEqual(source.pages.map((page) => page.id));
    expect(copy.activePageId).toBe(copy.pages[1].id);
    expect(copy.pages[0].strokes).toEqual(source.pages[0].strokes);
    expect(copy.pages[1].workflowSnapshot).toEqual(source.pages[1].workflowSnapshot);

    copy.pages[0].strokes[0].points[0].x = 99;
    expect(source.pages[0].strokes[0].points[0].x).toBe(1);
  });
});
