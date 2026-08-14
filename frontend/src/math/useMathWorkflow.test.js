import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  checkSteps: vi.fn(),
  getHint: vi.fn(),
  openMathSession: vi.fn(),
  transcribeLine: vi.fn(),
}));

import { checkSteps } from "../api";
import useMathWorkflow from "./useMathWorkflow";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function recognizerFrom(implementation, overrides = {}) {
  return {
    source: "test",
    inputMode: "image",
    supportsProvisional: false,
    recognize: vi.fn(implementation),
    ...overrides,
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

describe("useMathWorkflow recognition lifecycle", () => {
  let container;
  let root;
  let workflow;

  const renderWorkflow = async (options) => {
    function Harness() {
      workflow = useMathWorkflow(options);
      return null;
    }
    await act(async () => root.render(createElement(Harness)));
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    checkSteps.mockResolvedValue({ verdicts: [], first_wrong_line: 0 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("runs two recognitions concurrently and sends one ordered snapshot to the judge", async () => {
    const calls = new Map();
    const recognizer = recognizerFrom(({ expressionId }) => {
      const call = deferred();
      calls.set(expressionId, call);
      return call.promise;
    });
    await renderWorkflow({ pageId: "page-1", recognizer, emitRecognitionLifecycleMetric: vi.fn() });

    act(() => {
      workflow.invalidateRow(1);
      workflow.invalidateRow(2);
      workflow.queueRow({ row: 1, pageId: "page-1", strokes: [{}] });
      workflow.queueRow({ row: 2, pageId: "page-1", strokes: [{}] });
    });
    expect(recognizer.recognize).toHaveBeenCalledTimes(2);

    await act(async () => calls.get(2).resolve({ text: "x = 1" }));
    expect(workflow.lines).toEqual([]);
    await act(async () => calls.get(1).resolve({ text: "x + 1 = 2" }));
    await settle();

    expect(workflow.lines.map(({ row, text }) => [row, text])).toEqual([
      [1, "x + 1 = 2"],
      [2, "x = 1"],
    ]);
    expect(checkSteps).toHaveBeenCalledTimes(1);
    expect(checkSteps.mock.calls[0][2]).toEqual([{ line_number: 1, latex: "x = 1" }]);
  });

  it("keeps provisional output out of finalized lines and judge input", async () => {
    const recognizer = recognizerFrom(async () => ({
      text: "x +",
      provisional: true,
    }), {
      inputMode: "vector",
      supportsProvisional: true,
    });
    await renderWorkflow({ pageId: "page-1", recognizer, emitRecognitionLifecycleMetric: vi.fn() });
    act(() => {
      workflow.invalidateRow(1);
      workflow.queueRow({
        row: 1,
        pageId: "page-1",
        strokes: [{}],
        provisional: true,
      });
    });
    await settle();

    expect(workflow.provisionalByLine.get(1)?.text).toBe("x +");
    expect(workflow.lines).toEqual([]);
    expect(checkSteps).not.toHaveBeenCalled();
  });

  it("aborts and rejects an old page result after navigation", async () => {
    let oldSignal;
    const recognizer = recognizerFrom((_request) => new Promise((resolve, reject) => {
      oldSignal = _request.signal;
      oldSignal.addEventListener("abort", () => reject(oldSignal.reason));
    }));
    await renderWorkflow({ pageId: "page-1", recognizer, emitRecognitionLifecycleMetric: vi.fn() });
    act(() => {
      workflow.invalidateRow(1);
      workflow.queueRow({ row: 1, pageId: "page-1", strokes: [{}] });
    });
    expect(oldSignal.aborted).toBe(false);

    await renderWorkflow({ pageId: "page-2", recognizer, emitRecognitionLifecycleMetric: vi.fn() });
    await settle();
    expect(oldSignal.aborted).toBe(true);
    expect(workflow.lines).toEqual([]);
    expect(checkSteps).not.toHaveBeenCalled();
  });

  it("aborts an in-flight judge before edited ink can receive a stale verdict", async () => {
    let judgeSignal;
    checkSteps.mockImplementation((_topic, _problem, _steps, { signal }) => {
      judgeSignal = signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    });
    const recognizer = recognizerFrom(async ({ expressionId }) => ({
      text: expressionId === 1 ? "x + 1 = 2" : "x = 1",
    }));
    await renderWorkflow({ pageId: "page-1", recognizer, emitRecognitionLifecycleMetric: vi.fn() });
    act(() => {
      workflow.invalidateRow(1);
      workflow.invalidateRow(2);
      workflow.queueRow({ row: 1, pageId: "page-1", strokes: [{}] });
      workflow.queueRow({ row: 2, pageId: "page-1", strokes: [{}] });
    });
    await vi.waitFor(() => expect(judgeSignal).toBeDefined());
    expect(judgeSignal.aborted).toBe(false);

    act(() => workflow.invalidateRow(2));
    await settle();
    expect(judgeSignal.aborted).toBe(true);
    expect(workflow.verdictsByLine.size).toBe(0);
    expect(workflow.lines.map(({ row }) => row)).toEqual([1]);
  });
});
