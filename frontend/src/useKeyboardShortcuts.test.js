import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useKeyboardShortcuts from "./useKeyboardShortcuts";

describe("handwriting keyboard finalization", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("finalizes the active expression on Enter outside a text field", async () => {
    const onFinishLine = vi.fn();
    function Harness() {
      useKeyboardShortcuts({
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onFinishLine,
        onToggleNotebook: vi.fn(),
      });
      return null;
    }
    await act(async () => root.render(createElement(Harness)));
    globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onFinishLine).toHaveBeenCalledTimes(1);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onFinishLine).toHaveBeenCalledTimes(1);
    input.remove();

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onFinishLine).toHaveBeenCalledTimes(1);
    button.remove();
  });
});
