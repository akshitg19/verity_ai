import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Landing from "./Landing";
import { STACK } from "./landingContent";

const theme = { preference: "light", cycle: () => {} };

describe("Landing", () => {
  it("offers both workspaces from the header, pointing at the right routes", () => {
    // Only maths was reachable from the bar, and the user has to be able to
    // get to chemistry without hunting down the page for it.
    const html = renderToStaticMarkup(<Landing theme={theme} />);
    const header = html.slice(0, html.indexOf("</header>"));

    expect(header).toContain('href="/math"');
    expect(header).toContain('href="/chemistry"');
    expect(header).toContain("Open Math");
    expect(header).toContain("Open Chemistry");
  });

  it("renders every stack row", () => {
    // The last row used to be wrapped in its own scroll reveal, so it stayed
    // invisible until scrolled past and read as an empty bordered strip
    // hanging off the bottom of the table.
    const html = renderToStaticMarkup(<Landing theme={theme} />);

    for (const [piece, choice] of STACK) {
      expect(html).toContain(piece);
      expect(html).toContain(choice);
    }
    expect(html.match(/landing-stack__row/g)).toHaveLength(STACK.length);
  });

  it("leads with the headline and the tagline the logo already carries", () => {
    const html = renderToStaticMarkup(<Landing theme={theme} />);

    expect(html).toContain("Think it through.");
    expect(html).toMatch(/real time/i);
  });
});
