import { describe, expect, it } from "vitest";

import { MATH_TOPICS } from "../math/topics";
import { TOPICS } from "../chemistry/topics";
import {
  CHEM_SUBJECTS,
  DEMOS,
  FAQ,
  LADDER,
  MATH_SUBJECTS,
  PILLARS,
  ROADMAP,
  STACK,
} from "./landingContent";

describe("landing content", () => {
  it("names the maths subjects exactly as the app names them", () => {
    // The drift this catches: the landing page said "Elementary math" and
    // "Statistics" while the subject picker said "Pre-Algebra" and
    // "Statistics & Probability". A student reading the page and then opening
    // the app has to see the same six words.
    expect(MATH_SUBJECTS.map(([name]) => name)).toEqual(
      MATH_TOPICS.map((topic) => topic.label),
    );
  });

  it("counts chemistry question types from the real topic list", () => {
    const actual = TOPICS.map((topic) => [topic.label, topic.types.length]);
    const claimed = CHEM_SUBJECTS.map(([, , count]) => count);

    expect(claimed.reduce((a, b) => a + b, 0)).toBe(
      actual.reduce((total, [, count]) => total + count, 0),
    );
  });

  it("has six subjects on each side", () => {
    expect(MATH_SUBJECTS).toHaveLength(6);
    expect(CHEM_SUBJECTS).toHaveLength(6);
    expect(MATH_TOPICS).toHaveLength(6);
    expect(TOPICS).toHaveLength(6);
  });

  it("keeps the roadmap labelled as unbuilt", () => {
    // Every roadmap card must carry a status, so nothing on that section can
    // read as though it already ships.
    for (const item of ROADMAP) {
      expect(item.status).toMatch(/in progress|coming soon|planned/i);
    }
  });

  it("carries no rehearsal or build-detail copy", () => {
    const all = JSON.stringify([DEMOS, PILLARS, LADDER, STACK, FAQ, ROADMAP]);

    expect(all).not.toMatch(/MyScript/i);
    expect(all).not.toMatch(/rehearsal/i);
    expect(all).not.toMatch(/showcase/i);
    expect(all).not.toMatch(/presenter/i);
  });

  it("never claims a hint states the answer", () => {
    // The product rule the page is not allowed to contradict.
    const ladder = JSON.stringify(LADDER).toLowerCase();

    expect(ladder).toContain("never a corrected value");
    expect(ladder).not.toMatch(/gives you the answer|tells you the answer/);
  });
});
