import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelAllFinalizations,
  finalizationPolicyForRecognizer,
  IMAGE_FINALIZATION_POLICY,
  scheduleRowFinalization,
  VECTOR_FINALIZATION_POLICY,
} from "./finalizationPolicy";

afterEach(() => vi.useRealTimers());

describe("recognition finalization policy", () => {
  it("uses the longer batch-image quiet period by default", () => {
    expect(finalizationPolicyForRecognizer(null)).toBe(IMAGE_FINALIZATION_POLICY);
    expect(finalizationPolicyForRecognizer({ inputMode: "image" }))
      .toBe(IMAGE_FINALIZATION_POLICY);
  });

  it("enables per-stroke provisional work for an incremental vector provider", () => {
    expect(finalizationPolicyForRecognizer({ inputMode: "vector" }))
      .toEqual(VECTOR_FINALIZATION_POLICY);
    expect(finalizationPolicyForRecognizer({
      inputMode: "vector",
      supportsProvisional: false,
    }).provisionalAfterStroke).toBe(false);
  });

  it("does not auto-finalize a one-shot vector provider between pen strokes", async () => {
    vi.useFakeTimers();
    const policy = finalizationPolicyForRecognizer({
      inputMode: "vector",
      supportsProvisional: false,
      autoFinalize: false,
    });
    const timers = new Map();
    const finalized = vi.fn();

    expect(policy).toMatchObject({
      inputMode: "vector",
      provisionalAfterStroke: false,
      autoFinalize: false,
    });
    expect(scheduleRowFinalization(timers, 1, policy, finalized)).toBe(null);
    await vi.runAllTimersAsync();

    expect(timers.size).toBe(0);
    expect(finalized).not.toHaveBeenCalled();
  });

  it("reschedules one row without disturbing another row", async () => {
    vi.useFakeTimers();
    const timers = new Map();
    const finalized = [];

    scheduleRowFinalization(timers, 1, IMAGE_FINALIZATION_POLICY, (row) => finalized.push(row));
    scheduleRowFinalization(timers, 2, VECTOR_FINALIZATION_POLICY, (row) => finalized.push(row));
    await vi.advanceTimersByTimeAsync(350);
    expect(finalized).toEqual([2]);

    scheduleRowFinalization(timers, 1, IMAGE_FINALIZATION_POLICY, (row) => finalized.push(row));
    await vi.advanceTimersByTimeAsync(749);
    expect(finalized).toEqual([2]);
    await vi.advanceTimersByTimeAsync(1);
    expect(finalized).toEqual([2, 1]);
  });

  it("cancels every pending finalization on navigation or clear", async () => {
    vi.useFakeTimers();
    const timers = new Map();
    const finalized = vi.fn();
    scheduleRowFinalization(timers, 1, IMAGE_FINALIZATION_POLICY, finalized);
    scheduleRowFinalization(timers, 2, IMAGE_FINALIZATION_POLICY, finalized);
    cancelAllFinalizations(timers);
    await vi.runAllTimersAsync();
    expect(finalized).not.toHaveBeenCalled();
  });
});
