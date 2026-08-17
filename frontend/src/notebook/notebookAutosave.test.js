import { describe, expect, it, vi } from "vitest";

import {
  createNotebookAutosave,
  NOTEBOOK_AUTOSAVE_DELAY_MS,
} from "./notebookAutosave";

describe("notebook autosave batching", () => {
  it("coalesces repeated ink and workflow updates into one latest-page flush", async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn(async () => undefined);
    const autosave = createNotebookAutosave({ onFlush });

    const first = autosave.schedule({ noteId: "note-1", pageId: "page-1", strokes: [1] });
    const second = autosave.schedule({ noteId: "note-1", pageId: "page-1", strokes: [1, 2] });
    autosave.schedule({ noteId: "note-1", pageId: "page-1", workflowSnapshot: { topic: "algebra" } });

    expect(onFlush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(NOTEBOOK_AUTOSAVE_DELAY_MS);
    await Promise.all([first, second]);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([{
      noteId: "note-1",
      pageId: "page-1",
      strokes: [1, 2],
      workflowSnapshot: { topic: "algebra" },
    }]);
    vi.useRealTimers();
  });

  it("flushes immediately before navigation or export", async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn(async () => undefined);
    const autosave = createNotebookAutosave({ onFlush });

    autosave.schedule({ noteId: "note-1", pageId: "page-1", strokes: [1] });
    await autosave.flush();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(autosave.hasPending()).toBe(false);
    await vi.runAllTimersAsync();
    expect(onFlush).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("serializes a new batch behind an in-flight write", async () => {
    let releaseFirst;
    let announceFirst;
    const firstStarted = new Promise((resolve) => { announceFirst = resolve; });
    const order = [];
    const onFlush = vi.fn((patches) => {
      order.push(patches[0].strokes[0]);
      if (order.length === 1) {
        announceFirst();
        return new Promise((resolve) => { releaseFirst = resolve; });
      }
      return Promise.resolve();
    });
    const autosave = createNotebookAutosave({ onFlush });

    autosave.schedule({ noteId: "note-1", pageId: "page-1", strokes: [1] });
    const first = autosave.flush();
    autosave.schedule({ noteId: "note-1", pageId: "page-1", strokes: [2] });
    const second = autosave.flush();
    await firstStarted;
    expect(order).toEqual([1]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });
});
