import { describe, expect, it } from "vitest";

import { MATH_TOPICS, MATH_TOPIC_BY_ID } from "./topics";

describe("math topics", () => {
  it("defines exactly six top-level topics", () => {
    expect(MATH_TOPICS).toHaveLength(6);
  });

  it("uses the expected stable topic ids", () => {
    expect(MATH_TOPICS.map((topic) => topic.id)).toEqual([
      "pre_algebra",
      "algebra",
      "geometry",
      "trigonometry",
      "statistics",
      "calculus",
    ]);
  });

  it("marks algebra as implemented", () => {
    expect(MATH_TOPIC_BY_ID.algebra.implemented).toBe(true);
  });

  it("does not falsely mark unimplemented topics as ready", () => {
    for (const topic of MATH_TOPICS) {
      if (topic.id === "algebra") continue;
      expect(topic.implemented).toBe(false);
    }
  });

  it("indexes every topic by id", () => {
    for (const topic of MATH_TOPICS) {
      expect(MATH_TOPIC_BY_ID[topic.id]).toBe(topic);
    }
  });
});