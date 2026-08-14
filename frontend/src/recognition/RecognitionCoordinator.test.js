import { describe, expect, it, vi } from "vitest";

import RecognitionCoordinator from "./RecognitionCoordinator";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("RecognitionCoordinator", () => {
  it("recognizes two rows concurrently but commits and judges them in row order", async () => {
    const calls = new Map();
    const commits = [];
    const coordinator = new RecognitionCoordinator({
      recognize: (job) => {
        const call = deferred();
        calls.set(job.row, call);
        return call.promise;
      },
      onCommit: async (entries) => commits.push(entries.map(({ job }) => job.row)),
    });

    coordinator.enqueue({ row: 1, version: 1 });
    coordinator.enqueue({ row: 2, version: 1 });
    expect(calls.size).toBe(2);
    calls.get(2).resolve({ text: "second" });
    await Promise.resolve();
    expect(commits).toEqual([]);
    calls.get(1).resolve({ text: "first" });
    await coordinator.whenIdle();
    expect(commits).toEqual([[1, 2]]);
  });

  it("also batches the wave when the lower row finishes first", async () => {
    const calls = new Map();
    const commits = [];
    const coordinator = new RecognitionCoordinator({
      recognize: (job) => {
        const call = deferred();
        calls.set(job.row, call);
        return call.promise;
      },
      onCommit: async (entries) => commits.push(entries.map(({ job }) => job.row)),
    });
    coordinator.enqueue({ row: 1, version: 1 });
    coordinator.enqueue({ row: 2, version: 1 });
    calls.get(1).resolve({ text: "first" });
    await Promise.resolve();
    expect(commits).toEqual([]);
    calls.get(2).resolve({ text: "second" });
    await coordinator.whenIdle();
    expect(commits).toEqual([[1, 2]]);
  });

  it("never runs more than two recognition jobs", async () => {
    const calls = [];
    const coordinator = new RecognitionCoordinator({
      recognize: (job) => {
        const call = deferred();
        calls.push({ row: job.row, ...call });
        return call.promise;
      },
    });
    coordinator.enqueue({ row: 1, version: 1, provisional: true });
    coordinator.enqueue({ row: 2, version: 1 });
    coordinator.enqueue({ row: 3, version: 1 });
    expect(calls.map(({ row }) => row)).toEqual([1, 2]);
    calls[0].resolve({ text: "preview", provisional: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.map(({ row }) => row)).toEqual([1, 2, 3]);
    calls[1].resolve({ text: "two" });
    calls[2].resolve({ text: "three" });
    await coordinator.whenIdle();
  });

  it("publishes provisional text without committing it", async () => {
    const provisional = vi.fn();
    const commit = vi.fn();
    const coordinator = new RecognitionCoordinator({
      recognize: async (_job, { onProvisional }) => {
        onProvisional({ text: "x +" });
        return { text: "x + 1", provisional: true };
      },
      onProvisional: provisional,
      onCommit: commit,
    });
    coordinator.enqueue({ row: 1, version: 1, provisional: true });
    await coordinator.whenIdle();
    expect(provisional).toHaveBeenCalledTimes(2);
    expect(commit).not.toHaveBeenCalled();
  });

  it("rejects stale work after edit and commits one result per final version", async () => {
    const first = deferred();
    const commits = [];
    let currentVersion = 1;
    const coordinator = new RecognitionCoordinator({
      recognize: (job) => job.version === 1 ? first.promise : Promise.resolve({ text: "new" }),
      isCurrent: (job) => job.version === currentVersion,
      onCommit: async (entries) => commits.push(entries.map(({ job }) => job.version)),
    });
    coordinator.enqueue({ row: 1, version: 1 });
    currentVersion = 2;
    coordinator.invalidate(1);
    coordinator.enqueue({ row: 1, version: 2 });
    first.resolve({ text: "stale" });
    await coordinator.whenIdle();
    expect(commits).toEqual([[2]]);
    expect(coordinator.enqueue({ row: 1, version: 2 })).toBe(false);
  });

  it("aborts every in-flight job on page navigation", async () => {
    const signals = [];
    const commit = vi.fn();
    const coordinator = new RecognitionCoordinator({
      recognize: (_job, { signal }) => {
        signals.push(signal);
        return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
      },
      onCommit: commit,
    });
    coordinator.enqueue({ row: 1, version: 1 });
    coordinator.enqueue({ row: 2, version: 1 });
    coordinator.clear();
    await coordinator.whenIdle();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });
});
