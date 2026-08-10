import { describe, expect, it, vi } from "vitest";

import { openCurrentSession, readStructureSnapshot } from "./requestModel";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("chemistry request ownership", () => {
  it("does not transcribe a drawing that changed while PNG encoding was pending", async () => {
    const encoded = deferred();
    let current = true;
    const transcribe = vi.fn();
    const request = readStructureSnapshot(
      [{ points: [{ x: 1, y: 2 }] }],
      () => current,
      { render: () => encoded.promise, transcribe }
    );

    current = false;
    encoded.resolve("data:image/png;base64,old-ink");

    await expect(request).resolves.toBe(null);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("does not apply a transcription when new ink arrives during the request", async () => {
    const transcription = deferred();
    let current = true;
    const transcribe = vi.fn(() => transcription.promise);
    const request = readStructureSnapshot(
      [{ points: [{ x: 1, y: 2 }] }],
      () => current,
      {
        render: async () => "data:image/png;base64,current-ink",
        transcribe,
      }
    );

    await vi.waitFor(() => expect(transcribe).toHaveBeenCalledWith("current-ink"));
    current = false;
    transcription.resolve({ smiles: "CCO" });

    await expect(request).resolves.toBe(null);
  });

  it("returns the current drawing transcription", async () => {
    await expect(
      readStructureSnapshot(
        [{ points: [{ x: 1, y: 2 }] }],
        () => true,
        {
          render: async () => "data:image/png;base64,current-ink",
          transcribe: async (image) => ({ image, smiles: "CCO" }),
        }
      )
    ).resolves.toEqual({ image: "current-ink", smiles: "CCO" });
  });

  it("drops a session created for an earlier chemistry question", async () => {
    const opened = deferred();
    let current = true;
    const request = openCurrentSession(
      { topic: "structure", target_smiles: "CCO" },
      () => current,
      { open: () => opened.promise }
    );

    current = false;
    opened.resolve({ session_id: "old-problem" });

    await expect(request).resolves.toBe(null);
  });
});
