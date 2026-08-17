import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HANDWRITING_EXPERIMENT_PAIR_TOKEN_KEY,
  HANDWRITING_EXPERIMENT_PAIR_TOKEN_PATTERN,
} from "../recognition/handwritingExperienceExperiment";
import { RECOGNITION_METRIC_EVENT } from
  "../recognition/recognitionMetrics";
import HandwritingExperiencePanel from "./HandwritingExperiencePanel";

let root;
let container;

function render(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/math?hwr_ab=legacy");
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("HandwritingExperiencePanel consent gate", () => {
  it("starts no experiment collection until anonymous consent is given", () => {
    const addListener = vi.spyOn(globalThis, "addEventListener");
    const removeListener = vi.spyOn(globalThis, "removeEventListener");

    render(<HandwritingExperiencePanel />);

    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBe(null);
    expect(container.querySelector("select")).toBe(null);
    expect(sessionStorage.getItem(HANDWRITING_EXPERIMENT_PAIR_TOKEN_KEY))
      .toBe(null);
    expect(addListener).not.toHaveBeenCalledWith(
      RECOGNITION_METRIC_EVENT,
      expect.any(Function)
    );

    act(() => checkbox.click());

    const pairToken = sessionStorage.getItem(
      HANDWRITING_EXPERIMENT_PAIR_TOKEN_KEY
    );
    expect(pairToken).toMatch(HANDWRITING_EXPERIMENT_PAIR_TOKEN_PATTERN);
    expect(container.querySelector("select")).not.toBe(null);
    expect(addListener).toHaveBeenCalledWith(
      RECOGNITION_METRIC_EVENT,
      expect.any(Function)
    );

    act(() => checkbox.click());

    expect(container.querySelector("select")).toBe(null);
    expect(removeListener).toHaveBeenCalledWith(
      RECOGNITION_METRIC_EVENT,
      expect.any(Function)
    );
  });
});
