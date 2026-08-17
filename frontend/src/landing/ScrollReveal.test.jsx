import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ScrollReveal from "./ScrollReveal";

describe("ScrollReveal", () => {
  it("keeps server-rendered content visible and preserves semantic elements", () => {
    const html = renderToStaticMarkup(
      <ScrollReveal as="article" delay={140} variant="scale">
        Product content
      </ScrollReveal>,
    );

    expect(html).toContain("<article");
    expect(html).toContain("scroll-reveal--scale is-visible");
    expect(html).toContain("--reveal-delay:140ms");
    expect(html).toContain("Product content");
  });
});
