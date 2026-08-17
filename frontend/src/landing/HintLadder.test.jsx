import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HintLadder from "./HintLadder";
import { LADDER } from "./landingContent";

describe("HintLadder", () => {
  it("draws three rungs, lowest level at the bottom", () => {
    const html = renderToStaticMarkup(<HintLadder />);

    expect(LADDER).toHaveLength(3);
    for (const rung of LADDER) expect(html).toContain(rung.name);

    // The ladder is built top down, so level 3 is rendered before level 1.
    expect(html.indexOf(LADDER[2].name)).toBeLessThan(html.indexOf(LADDER[0].name));
  });

  it("shows the stop above the top rung", () => {
    const html = renderToStaticMarkup(<HintLadder />);

    expect(html).toContain("The answer");
    expect(html).toContain("never handed over");
    expect(html.indexOf("never handed over")).toBeLessThan(html.indexOf(LADDER[2].name));
  });

  it("opens on level 1", () => {
    const html = renderToStaticMarkup(<HintLadder />);

    expect(html).toContain("Level 1");
    expect(html).toContain(LADDER[0].example);
  });

  it("never puts a corrected value in the level 1 example", () => {
    // Level 1 diagnoses and must not state a corrected value. The example on
    // the page is the promise a visitor reads, so it has to keep the rule the
    // product keeps.
    expect(LADDER[0].example).not.toMatch(/x\s*=\s*\d/);
  });
});
