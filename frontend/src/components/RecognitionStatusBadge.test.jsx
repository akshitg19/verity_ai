import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RecognitionStatusBadge from "./RecognitionStatusBadge";

describe("RecognitionStatusBadge", () => {
  it("shows the presenter MyScript beta, vector source, and latency", () => {
    const html = renderToStaticMarkup(
      <RecognitionStatusBadge
        mode="math"
        status={{
          state: "success",
          source: "myscript",
          inputMode: "vector",
          latencyMs: 84,
        }}
      />
    );
    expect(html).toContain("MyScript Beta");
    expect(html).toContain("Vector recognition");
    expect(html).toContain("84 ms");
  });

  it("labels chemistry as Gemini image recognition", () => {
    const html = renderToStaticMarkup(
      <RecognitionStatusBadge mode="chemistry" status={null} />
    );
    expect(html).toContain("Gemini");
    expect(html).toContain("Image recognition");
    expect(html).not.toContain("MyScript");
  });
});
