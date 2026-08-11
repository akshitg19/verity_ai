import { describe, expect, it, vi } from "vitest";

import { exportPage, pageFileName, renderPageToCanvas } from "./exportPage";

// A canvas that records what was asked of it, so the drawing can be checked
// without a DOM.
function fakeCanvas() {
  const calls = [];
  const context = new Proxy(
    { strokeStyle: null, fillStyle: null, lineWidth: null },
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => calls.push([key, ...args]);
      },
      set(target, key, value) {
        target[key] = value;
        calls.push([`set:${String(key)}`, value]);
        return true;
      },
    }
  );
  return {
    calls,
    canvas: {
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => "data:image/png;base64,fake",
    },
  };
}

function documentLike(canvas, link = {}) {
  return {
    createElement: (tag) => (tag === "canvas" ? canvas : link),
  };
}

const stroke = (points, extra = {}) => ({ points, ...extra });

describe("pageFileName", () => {
  it("keeps a readable name", () => {
    expect(pageFileName("Balancing propane", 2)).toBe("Balancing propane p2.png");
  });

  it("strips characters no filesystem accepts", () => {
    // Notes name themselves after their question, and a question is full of
    // slashes, colons and angle brackets.
    expect(pageFileName("C3H8 + O2 -> CO2/H2O: step 1?", 1)).toBe(
      "C3H8 + O2 - CO2 H2O step 1 p1.png"
    );
  });

  it("falls back when the title is empty or all punctuation", () => {
    expect(pageFileName("", 1)).toBe("verity page p1.png");
    expect(pageFileName("///", 3)).toBe("verity page p3.png");
  });

  it("caps a very long title", () => {
    expect(pageFileName("x".repeat(200), 1)).toBe(`${"x".repeat(60)} p1.png`);
  });
});

describe("renderPageToCanvas", () => {
  it("draws each stroke in the colour it was written in", () => {
    // The recognition renderer flattens every pen to one ink colour, and this
    // one must not: a student saving their page wants their page.
    const { calls, canvas } = fakeCanvas();
    renderPageToCanvas(
      [
        stroke([{ x: 0, y: 0 }, { x: 5, y: 5 }], { color: "#a94a4a" }),
        stroke([{ x: 6, y: 6 }, { x: 9, y: 9 }], { color: "#315f8a" }),
      ],
      { documentLike: documentLike(canvas) }
    );

    const strokeColours = calls
      .filter(([key]) => key === "set:strokeStyle")
      .map(([, value]) => value);

    expect(strokeColours).toContain("#a94a4a");
    expect(strokeColours).toContain("#315f8a");
  });

  it("draws a single-point stroke as a dot rather than nothing", () => {
    const { calls, canvas } = fakeCanvas();
    renderPageToCanvas([stroke([{ x: 3, y: 3 }])], {
      documentLike: documentLike(canvas),
    });

    expect(calls.some(([key]) => key === "arc")).toBe(true);
  });

  it("skips a point with a non-finite coordinate", () => {
    const { calls, canvas } = fakeCanvas();
    renderPageToCanvas(
      [stroke([{ x: 0, y: 0 }, { x: NaN, y: 4 }, { x: 8, y: 8 }])],
      { documentLike: documentLike(canvas) }
    );

    expect(calls.filter(([key]) => key === "lineTo")).toHaveLength(1);
  });
});

describe("exportPage", () => {
  it("does nothing on an empty page", () => {
    const { canvas } = fakeCanvas();
    const link = { click: vi.fn() };

    expect(exportPage([], "Chemistry 1", 1, { documentLike: documentLike(canvas, link) })).toBe(
      false
    );
    expect(link.click).not.toHaveBeenCalled();
  });

  it("downloads a named file when there is ink", () => {
    const { canvas } = fakeCanvas();
    const link = { click: vi.fn() };

    const done = exportPage([stroke([{ x: 0, y: 0 }, { x: 4, y: 4 }])], "Titration", 2, {
      documentLike: documentLike(canvas, link),
    });

    expect(done).toBe(true);
    expect(link.download).toBe("Titration p2.png");
    expect(link.click).toHaveBeenCalledOnce();
  });
});
