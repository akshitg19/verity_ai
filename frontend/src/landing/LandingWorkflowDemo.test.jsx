import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LandingWorkflowDemo from "./LandingWorkflowDemo";
import { DEMOS } from "./landingContent";

const [algebra] = DEMOS;

describe("LandingWorkflowDemo", () => {
  it("renders an accessible walkthrough for the demo it is given", () => {
    const html = renderToStaticMarkup(<LandingWorkflowDemo demo={algebra} />);

    expect(html).toContain("Algebra walkthrough");
    expect(html).toContain("Walkthrough stage");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("2x + 3 = 11");
    expect(html).toContain("x = 5");
    expect(html).toContain("Pause the Algebra walkthrough");
  });

  it("drives every demo, not just the algebra one", () => {
    for (const demo of DEMOS) {
      // A reaction arrow renders as the entity `-&gt;`, so compare against
      // text rather than against markup.
      const text = renderToStaticMarkup(<LandingWorkflowDemo demo={demo} />)
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
      expect(text).toContain(demo.eyebrow);
      expect(text).toContain(demo.prompt);
      for (const line of demo.lines) expect(text).toContain(line.text);
    }
  });

  it("names an engine rather than a build detail", () => {
    // The middle stage used to read "MyScript Beta · Vector · 272 ms
    // rehearsal", which is a rehearsal artefact from a build that is not what
    // ships, on a page read by people deciding whether to trust the product.
    const html = DEMOS.map((demo) =>
      renderToStaticMarkup(<LandingWorkflowDemo demo={demo} />)).join("");

    expect(html).not.toMatch(/MyScript/i);
    expect(html).not.toMatch(/rehearsal/i);
    expect(html).not.toMatch(/\d+\s*ms/i);
  });

  it("shows two maths and two chemistry walkthroughs", () => {
    const subjects = DEMOS.map((demo) => demo.subject);

    expect(subjects.filter((subject) => subject === "math")).toHaveLength(2);
    expect(subjects.filter((subject) => subject === "chemistry")).toHaveLength(2);
  });

  it("flags exactly the lines the real judges flagged", () => {
    // Each of these was run through the live endpoint before it was written
    // into landingContent.js. If one changes, re-run it rather than editing
    // the expectation here.
    const flagged = Object.fromEntries(
      DEMOS.map((demo) => [
        demo.id,
        demo.lines.filter((line) => line.state === "invalid").map((line) => line.text),
      ]),
    );

    expect(flagged.algebra).toEqual(["x = 5"]);
    expect(flagged.statistics).toEqual(["9"]);
    expect(flagged.balancing).toEqual(["C3H8 + 4O2 -> 3CO2 + 4H2O"]);
    expect(flagged.organic).toEqual(["CCCO"]);
  });
});
