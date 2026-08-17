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

  it("marks implemented topics as ready", () => {
    expect(MATH_TOPIC_BY_ID.pre_algebra.implemented).toBe(true);
    expect(MATH_TOPIC_BY_ID.algebra.implemented).toBe(true);
  });

  it("does not falsely mark unimplemented topics as ready", () => {
    const implementedTopics = new Set([
      "pre_algebra", 
      "algebra",
      "trigonometry",
      "calculus",
      "statistics",
    ]);

    for (const topic of MATH_TOPICS) {
      if (implementedTopics.has(topic.id)) continue;
      expect(topic.implemented).toBe(false);
    }
  });

  it("indexes every topic by id", () => {
    for (const topic of MATH_TOPICS) {
      expect(MATH_TOPIC_BY_ID[topic.id]).toBe(topic);
    }
  });
});