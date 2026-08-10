import { describe, expect, it } from "vitest";

import {
  getRenderBounds,
  RECOGNITION_INK_COLOR,
  renderLineToPng,
} from "./render";

function fakeCanvasFactory() {
  const calls = [];
  const context = {
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    stroke: () => calls.push(["stroke"]),
    fill: () => calls.push(["fill"]),
    arc: (...args) => calls.push(["arc", ...args]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback, type) {
      calls.push(["toBlob", type]);
      queueMicrotask(() => callback({ type }));
    },
  };
  return { canvas, context, calls };
}

class FakeFileReader {
  readAsDataURL() {
    this.result = "data:image/png;base64,encoded";
    queueMicrotask(() => this.onload());
  }
}

function renderDocument(fakeCanvas) {
  return { createElement: () => fakeCanvas };
}

describe("renderLineToPng", () => {
  it("returns a valid one-pixel export for empty input", async () => {
    const fake = fakeCanvasFactory();
    const bounds = getRenderBounds([]);
    const result = await renderLineToPng([], {
      documentLike: renderDocument(fake.canvas),
      FileReaderImpl: FakeFileReader,
    });

    expect(bounds.empty).toBe(true);
    expect(fake.canvas.width).toBe(1);
    expect(fake.canvas.height).toBe(1);
    expect(result).toBe("data:image/png;base64,encoded");
  });

  it("crops to ink bounds with padding and preserves translated coordinates", async () => {
    const fake = fakeCanvasFactory();
    await renderLineToPng(
      [{ points: [{ x: 10.2, y: 20.1 }, { x: 30.7, y: 40.9 }] }],
      {
        padding: 4,
        documentLike: renderDocument(fake.canvas),
        FileReaderImpl: FakeFileReader,
      }
    );

    expect(fake.canvas.width).toBe(29);
    expect(fake.canvas.height).toBe(29);
    expect(fake.calls).toContainEqual(["moveTo", 4, 4]);
    const translatedEnd = fake.calls.find((call) => call[0] === "lineTo" && call[1] !== 29);
    expect(translatedEnd[1]).toBeCloseTo(24.5);
    expect(translatedEnd[2]).toBeCloseTo(24.8);
  });

  it("scales export pixels and ink together", async () => {
    const fake = fakeCanvasFactory();
    await renderLineToPng(
      [{ points: [{ x: 5, y: 7 }, { x: 15, y: 17 }] }],
      {
        padding: 2,
        scale: 2,
        documentLike: renderDocument(fake.canvas),
        FileReaderImpl: FakeFileReader,
      }
    );

    expect(fake.canvas.width).toBe(28);
    expect(fake.canvas.height).toBe(28);
    expect(fake.context.lineWidth).toBe(5);
    expect(fake.context.strokeStyle).toBe(RECOGNITION_INK_COLOR);
  });

  it("waits for asynchronous PNG blob and file-reader completion", async () => {
    const fake = fakeCanvasFactory();
    let settled = false;
    const result = renderLineToPng(
      [{ points: [{ x: 1, y: 1 }] }],
      {
        documentLike: renderDocument(fake.canvas),
        FileReaderImpl: FakeFileReader,
      }
    ).then((value) => {
      settled = true;
      return value;
    });

    expect(settled).toBe(false);
    await expect(result).resolves.toBe("data:image/png;base64,encoded");
    expect(settled).toBe(true);
    expect(fake.calls).toContainEqual(["toBlob", "image/png"]);
  });
});
