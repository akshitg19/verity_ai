import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LandingProductStory from "./LandingProductStory";
import { STORY_SCENES } from "./landingStoryData";

describe("LandingProductStory", () => {
  it("describes real Math, Chemistry, and deterministic feedback scenes", () => {
    const html = renderToStaticMarkup(<LandingProductStory />);

    expect(STORY_SCENES.map((scene) => scene.id)).toEqual([
      "math",
      "chemistry",
      "feedback",
    ]);
    expect(html).toContain("SymPy · first-break feedback");
    expect(html).toContain("Gemini recognition · chemistry-specific judges");
    expect(html).toContain("Recognition reads. Deterministic engines decide.");
    expect(html).toContain("/verity-chemistry-showcase.jpg");
  });
});
