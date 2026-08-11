import { beforeEach, describe, expect, it } from "vitest";

import {
  TOPIC_STORAGE_KEY,
  readStoredTopic,
  rememberTopic,
} from "./topicMemory";

// A stand-in for localStorage, so these run without a DOM and so the throwing
// case can be provoked on purpose.
function fakeStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    read: () => value,
  };
}

describe("readStoredTopic", () => {
  it("defaults to structure when nothing has been stored", () => {
    expect(readStoredTopic(fakeStorage())).toEqual({
      topicId: "structure",
      typeId: null,
      values: null,
    });
  });

  it("returns to the topic the student was last on", () => {
    const storage = fakeStorage();
    rememberTopic(
      "balancing",
      "balance",
      { reference_equation: "C3H8 + O2 -> CO2 + H2O" },
      storage
    );

    expect(readStoredTopic(storage)).toEqual({
      topicId: "balancing",
      typeId: "balance",
      values: { reference_equation: "C3H8 + O2 -> CO2 + H2O" },
    });
  });

  it("keeps the topic when the stored type no longer exists", () => {
    const storage = fakeStorage(
      JSON.stringify({ topicId: "balancing", typeId: "gone", values: {} })
    );

    expect(readStoredTopic(storage)).toEqual({
      topicId: "balancing",
      typeId: null,
      values: null,
    });
  });

  it("drops a field the current form does not have", () => {
    const storage = fakeStorage(
      JSON.stringify({
        topicId: "balancing",
        typeId: "balance",
        values: { reference_equation: "H2 + O2 -> H2O", removed_field: "x" },
      })
    );

    expect(readStoredTopic(storage).values).toEqual({
      reference_equation: "H2 + O2 -> H2O",
    });
  });

  it("ignores a value that is not a string", () => {
    const storage = fakeStorage(
      JSON.stringify({
        topicId: "balancing",
        typeId: "balance",
        values: { reference_equation: { nested: true } },
      })
    );

    expect(readStoredTopic(storage).values).toEqual({ reference_equation: "" });
  });

  it("falls back rather than throwing on a corrupt store", () => {
    expect(readStoredTopic(fakeStorage("{not json"))).toEqual({
      topicId: "structure",
      typeId: null,
      values: null,
    });
  });

  it("falls back when the stored topic has been removed from the product", () => {
    const storage = fakeStorage(JSON.stringify({ topicId: "astrology" }));

    expect(readStoredTopic(storage).topicId).toBe("structure");
  });
});

describe("rememberTopic", () => {
  let storage;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it("writes under the versioned key", () => {
    const keys = [];
    rememberTopic("balancing", "balance", {}, {
      setItem: (key) => keys.push(key),
    });

    expect(keys).toEqual([TOPIC_STORAGE_KEY]);
  });

  it("survives storage being unavailable", () => {
    expect(() =>
      rememberTopic("balancing", "balance", {}, {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      })
    ).not.toThrow();
  });

  it("round-trips through the real shape", () => {
    rememberTopic("redox", "half_reaction", { reference_equation: "" }, storage);

    expect(JSON.parse(storage.read())).toEqual({
      topicId: "redox",
      typeId: "half_reaction",
      values: { reference_equation: "" },
    });
  });
});
