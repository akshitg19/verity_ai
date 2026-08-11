import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ErrorBoundary from "./ErrorBoundary";

let root;
let container;

function render(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

function Boom() {
  throw new Error("activeNote is undefined");
}

beforeEach(() => {
  // React logs the caught error itself. These tests assert behaviour, not noise.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders its children when nothing is wrong", () => {
    render(
      <ErrorBoundary>
        <p>the workspace</p>
      </ErrorBoundary>
    );

    expect(container.textContent).toContain("the workspace");
  });

  it("shows the actual error text instead of a white screen", () => {
    // The whole point of the component. On a tablet there is no console to
    // open, so unless the message is on screen a crash is indistinguishable
    // from a hang, and "it does not work" is all anyone can report.
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent).toContain("activeNote is undefined");
  });

  it("offers a reload, which is the one thing a student can do about it", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button.textContent).toMatch(/reload/i);
  });

  it("says the notes are safe, because that is the first thing anyone fears", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(container.textContent).toMatch(/not affected/i);
  });
});
