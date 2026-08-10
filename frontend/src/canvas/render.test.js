import { describe, expect, it } from "vitest";

import {
  canvasToPngDataUrl,
  getRenderBounds,
  MAX_RENDER_SCALE,
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

  it("normalizes negative coordinates and ignores non-finite points", async () => {
    const fake = fakeCanvasFactory();
    const strokes = [
      {
        points: [
          { x: Number.NaN, y: 1 },
          { x: -12, y: -8 },
          { x: 8, y: 2 },
        ],
      },
    ];

    expect(getRenderBounds(strokes, 2)).toMatchObject({
      minX: -12,
      maxX: 8,
      minY: -8,
      maxY: 2,
      width: 24,
      height: 14,
    });
    await renderLineToPng(strokes, {
      padding: 2,
      documentLike: renderDocument(fake.canvas),
      FileReaderImpl: FakeFileReader,
    });

    expect(fake.calls).toContainEqual(["moveTo", 2, 2]);
    expect(fake.calls).toContainEqual(["lineTo", 22, 12]);
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

  it("falls back for invalid scales and caps oversized exports", async () => {
    const invalidScale = fakeCanvasFactory();
    await renderLineToPng(
      [{ points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }],
      {
        padding: 2,
        scale: Number.NaN,
        documentLike: renderDocument(invalidScale.canvas),
        FileReaderImpl: FakeFileReader,
      }
    );
    expect(invalidScale.canvas.width).toBe(14);
    expect(invalidScale.context.lineWidth).toBe(2.5);

    const oversizedScale = fakeCanvasFactory();
    await renderLineToPng(
      [{ points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }],
      {
        padding: 2,
        scale: 100,
        documentLike: renderDocument(oversizedScale.canvas),
        FileReaderImpl: FakeFileReader,
      }
    );
    expect(oversizedScale.canvas.width).toBe(14 * MAX_RENDER_SCALE);
    expect(oversizedScale.context.lineWidth).toBe(2.5 * MAX_RENDER_SCALE);
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

  it("reports canvas, blob, and file-reader failures", async () => {
    await expect(
      renderLineToPng([{ points: [{ x: 1, y: 1 }] }], {
        documentLike: renderDocument({
          width: 0,
          height: 0,
          getContext: () => null,
        }),
        FileReaderImpl: FakeFileReader,
      })
    ).rejects.toThrow("handwriting canvas could not be created");

    await expect(
      canvasToPngDataUrl({ toBlob: (callback) => callback(null) }, {
        FileReaderImpl: FakeFileReader,
      })
    ).rejects.toThrow("handwriting image could not be encoded");

    class FailedFileReader {
      readAsDataURL() {
        queueMicrotask(() => this.onerror());
      }
    }
    await expect(
      canvasToPngDataUrl(
        { toBlob: (callback) => callback({ type: "image/png" }) },
        { FileReaderImpl: FailedFileReader }
      )
    ).rejects.toThrow("handwriting image could not be read");
  });
});
