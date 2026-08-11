import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProblemSlotOverlay from "./ProblemSlotOverlay";
import { buildSlots, layoutSlots } from "./problemSlots";
import { TOPICS } from "./topics";

let root;
let container;

function render(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

const stoichiometry = TOPICS.find((topic) => topic.id === "stoichiometry");
const percentYield = stoichiometry.types.find((t) => t.id === "percent_yield");
const layout = layoutSlots(buildSlots(percentYield));

describe("the problem drawn on the page", () => {
  it("labels every slot so a student knows what goes where", () => {
    render(<ProblemSlotOverlay layout={layout} width={800} />);

    expect(container.textContent).toContain("Equation");
    expect(container.textContent).toContain("Amounts");
    expect(container.textContent).toContain("Product");
    expect(container.textContent).toContain("Mass you collected");
  });

  it("prints the unit outside the box rather than asking for it", () => {
    render(<ProblemSlotOverlay layout={layout} width={800} />);

    // The g belongs to the question, not to the student's answer.
    expect(container.textContent).toContain("g");
  });

  it("marks where the working starts", () => {
    render(<ProblemSlotOverlay layout={layout} width={800} />);

    expect(container.textContent).toContain("Your working");
  });

  it("offers another row on the amounts table", () => {
    const onAddPairRow = vi.fn();
    render(<ProblemSlotOverlay layout={layout} width={800} onAddPairRow={onAddPairRow} />);

    const button = container.querySelector("button");
    expect(button.textContent).toContain("row");
    act(() => button.click());
    expect(onAddPairRow).toHaveBeenCalled();
  });

  it("renders nothing before the canvas has a width", () => {
    // Guards against a first paint at width 0 drawing every box on top of
    // itself in the top left corner.
    render(<ProblemSlotOverlay layout={layout} width={0} />);

    expect(container.textContent).toBe("");
  });

  it("renders nothing for a type with no slots", () => {
    render(<ProblemSlotOverlay layout={[]} width={800} />);

    expect(container.textContent).toBe("");
  });

  it("is invisible to assistive tech, being a guide and not a control", () => {
    render(<ProblemSlotOverlay layout={layout} width={800} />);

    expect(container.firstChild.getAttribute("aria-hidden")).toBe("true");
  });

  it("does not swallow pointer events meant for the canvas", () => {
    // The whole overlay sits under the ink. If this ever becomes "auto" the
    // student cannot write on the page at all, which is the worst possible
    // regression here.
    render(<ProblemSlotOverlay layout={layout} width={800} />);

    expect(container.firstChild.style.pointerEvents).toBe("none");
  });
});
