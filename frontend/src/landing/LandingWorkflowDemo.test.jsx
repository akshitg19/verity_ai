import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LandingWorkflowDemo from "./LandingWorkflowDemo";

describe("LandingWorkflowDemo", () => {
  it("presents an honest, accessible recorded Algebra walkthrough", () => {
    const html = renderToStaticMarkup(<LandingWorkflowDemo />);

    expect(html).toContain("Interactive Algebra feedback walkthrough");
    expect(html).toContain("Recorded");
    expect(html).toContain("Walkthrough stage");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("2x + 3 = 11");
    expect(html).toContain("x = 5");
    expect(html).toContain("Pen input · complete one line");
    expect(html).toContain("Pause walkthrough");
  });
});
