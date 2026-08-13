import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkedExampleStepper from "./WorkedExampleStepper";

let root;
let container;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
});

function render(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

function click(label) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label
  );
  if (!button) throw new Error(`no button labelled ${label}`);
  act(() => button.click());
}

function tick(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const balancing = {
  problem: "Balance Fe + O2 -> Fe2O3",
  technique: "Balance the metal last",
  steps: [
    "Start: Fe + O2 -> Fe2O3",
    "Balance oxygen: Fe + 3O2 -> 2Fe2O3",
    "Balance iron: 4Fe + 3O2 -> 2Fe2O3",
  ],
  equations: ["Fe + O2 -> Fe2O3", "Fe + 3O2 -> 2Fe2O3", "4Fe + 3O2 -> 2Fe2O3"],
  quantities: [null, null, null],
  verified: true,
};

const numeric = {
  problem: "Find the molar mass of KNO3",
  technique: "Add each element's contribution",
  steps: [
    "Mass of K: 39.10 g/mol",
    "Mass of N: 14.01 g/mol",
    "Mass of O: 48.00 g/mol",
    "Molar mass: 101.11 g/mol",
  ],
  equations: [null, null, null, null],
  quantities: [
    { value: 39.1, unit: "g/mol", label: null, text: "39.10 g/mol" },
    { value: 14.01, unit: "g/mol", label: null, text: "14.01 g/mol" },
    { value: 48, unit: "g/mol", label: null, text: "48.00 g/mol" },
    { value: 101.11, unit: "g/mol", label: null, text: "101.11 g/mol" },
  ],
  verified: true,
};

describe("the worked example, played rather than listed", () => {
  it("starts on step one and never moves on its own", () => {
    vi.useFakeTimers();
    render(<WorkedExampleStepper example={balancing} />);
    expect(container.textContent).toContain("Step 1 of 3");

    // A panel that starts animating under the student is the complaint that
    // closed the old one. It waits to be asked.
    tick(20000);
    expect(container.textContent).toContain("Step 1 of 3");
  });

  it("plays to the end, stops there, and offers a replay", () => {
    vi.useFakeTimers();
    render(<WorkedExampleStepper example={balancing} />);
    click("Play");

    tick(3000);
    expect(container.textContent).toContain("Step 2 of 3");
    tick(3000);
    expect(container.textContent).toContain("Step 3 of 3");

    // Runs off the end rather than looping back to the start.
    tick(20000);
    expect(container.textContent).toContain("Step 3 of 3");
    expect(container.textContent).toContain("Play again");
  });

  it("pauses where it is", () => {
    vi.useFakeTimers();
    render(<WorkedExampleStepper example={balancing} />);
    click("Play");
    tick(3000);
    expect(container.textContent).toContain("Step 2 of 3");
    click("Pause");
    tick(20000);
    expect(container.textContent).toContain("Step 2 of 3");
  });

  it("replays from the start", () => {
    vi.useFakeTimers();
    render(<WorkedExampleStepper example={balancing} />);
    click("Play");
    // Advanced one step at a time: each step schedules the next only after
    // its own effect has run, so one long jump lands on the first one.
    tick(3000);
    tick(3000);
    expect(container.textContent).toContain("Step 3 of 3");
    click("Play again");
    expect(container.textContent).toContain("Step 1 of 3");
  });

  it("counts atoms on a balancing example", () => {
    render(<WorkedExampleStepper example={balancing} />);
    const tally = [...container.querySelectorAll("[title]")].map(
      (node) => node.getAttribute("title")
    );
    expect(tally.some((text) => text.includes("Fe: 1 on the left, 2 on the right"))).toBe(
      true
    );
  });

  it("grows a quantity trail on a numeric example", () => {
    render(<WorkedExampleStepper example={numeric} />);
    expect(container.textContent).toContain("39.10 g/mol");
    // The later quantities have not arrived, so the whole worked answer is
    // not handed over in one glance.
    expect(container.textContent).not.toContain("101.11 g/mol");

    click("Next step");
    expect(container.textContent).toContain("14.01 g/mol");
    expect(container.textContent).toContain("39.10 g/mol");
  });

  it("renders nothing when there are no steps", () => {
    render(
      <WorkedExampleStepper example={{ problem: "", technique: "", steps: [] }} />
    );
    expect(container.textContent).toBe("");
  });

  it("survives a response carrying no quantities and no equations", () => {
    render(
      <WorkedExampleStepper
        example={{ problem: "p", technique: "t", steps: ["one", "two"] }}
      />
    );
    expect(container.textContent).toContain("Step 1 of 2");
  });
});
