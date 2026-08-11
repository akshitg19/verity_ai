import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import ActionDialog from "./ActionDialog";
import HintLadder from "./HintLadder";

let root;
let container;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  sessionStorage.clear();
});

function render(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

describe("workspace interactions", () => {
  it("collapses loaded hint content when Hide hints is pressed", () => {
    sessionStorage.setItem("verity.hintsOpen", "1");
    render(
      <HintLadder
        level={1}
        hint="Compare the signs."
        loading={false}
        onRequest={() => {}}
        onCancel={() => {}}
      />
    );

    expect(container.textContent).toContain("Compare the signs.");
    const hide = [...container.querySelectorAll("button")].find((button) => button.textContent === "Hide hints");
    act(() => hide.click());
    expect(container.textContent).not.toContain("Compare the signs.");
    expect(container.textContent).toContain("Show hints");
  });

  it("traps dialog focus and closes on Escape", () => {
    let closed = false;
    render(
      <ActionDialog open title="Clear?" onClose={() => { closed = true; }}>
        <button type="button">Confirm</button>
        <button type="button">Cancel</button>
      </ActionDialog>
    );

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBe(null);
    act(() => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(closed).toBe(true);
  });
});
