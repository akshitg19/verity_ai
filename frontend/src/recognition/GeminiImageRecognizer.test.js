import { describe, expect, it, vi } from "vitest";

import GeminiImageRecognizer, { pngPayload } from "./GeminiImageRecognizer";

describe("GeminiImageRecognizer", () => {
  it("encapsulates PNG rendering and the existing transcription API", async () => {
    const signal = new AbortController().signal;
    const render = vi.fn(async () => "data:image/png;base64,cG5n");
    const transcribe = vi.fn(async () => ({ text: "3*x + 2 = 5", unreadable: false }));
    const metrics = [];
    let clock = 0;
    const recognizer = new GeminiImageRecognizer({
      render,
      transcribe,
      now: () => ++clock,
      emitMetric: (record) => metrics.push(record),
    });
    const strokes = [{ points: [{ x: 1, y: 2, t: 3, p: 0.5 }] }];

    await expect(recognizer.recognize({
      strokes,
      expressionVersion: 4,
      signal,
    })).resolves.toMatchObject({
      text: "3*x + 2 = 5",
      source: "gemini",
      format: "ascii",
      unreadable: false,
    });
    expect(render).toHaveBeenCalledWith(strokes);
    expect(transcribe).toHaveBeenCalledWith("cG5n", { signal });
    expect(metrics[0]).toMatchObject({
      provider: "gemini",
      mode: "image",
      expressionVersion: 4,
    });
  });

  it("preserves unreadable results", async () => {
    const recognizer = new GeminiImageRecognizer({
      render: async () => "data:image/png;base64,cG5n",
      transcribe: async () => ({ text: "", unreadable: true }),
    });
    await expect(recognizer.recognize({ strokes: [{}] })).resolves.toMatchObject({
      text: "",
      unreadable: true,
      parseable: false,
    });
  });

  it("rejects empty ink and non-PNG renderer output", async () => {
    const recognizer = new GeminiImageRecognizer();
    await expect(recognizer.recognize({ strokes: [] })).rejects.toMatchObject({
      code: "empty_ink",
    });
    expect(() => pngPayload("data:image/jpeg;base64,bad")).toThrow(/PNG data/);
  });

  it("does not call the API when cancelled during encoding", async () => {
    const controller = new AbortController();
    const transcribe = vi.fn();
    const recognizer = new GeminiImageRecognizer({
      render: async () => {
        controller.abort(new DOMException("edited", "AbortError"));
        return "data:image/png;base64,cG5n";
      },
      transcribe,
    });
    await expect(recognizer.recognize({ strokes: [{}], signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(transcribe).not.toHaveBeenCalled();
  });
});

