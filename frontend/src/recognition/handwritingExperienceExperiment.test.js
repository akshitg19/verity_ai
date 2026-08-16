import { describe, expect, it } from "vitest";

import {
  getOrCreateHandwritingExperimentPairToken,
  isInternalHost,
  resolveHandwritingExperienceExperiment,
} from "./handwritingExperienceExperiment";

function location(hostname, search) {
  return { hostname, search };
}

describe("handwriting experience experiment", () => {
  it("enables the scheduling-only variants on local development", () => {
    expect(resolveHandwritingExperienceExperiment(
      location("localhost", "?hwr_ab=legacy")
    )).toMatchObject({
      enabled: true,
      variant: "legacy",
      quietPeriodMs: 1500,
      maxRecognitionConcurrency: 1,
    });
    expect(resolveHandwritingExperienceExperiment(
      location("127.0.0.1", "?hwr_ab=current")
    )).toMatchObject({
      enabled: true,
      variant: "current",
      quietPeriodMs: 750,
      maxRecognitionConcurrency: 2,
    });
  });

  it("permits Vercel previews but never the production frontend", () => {
    expect(isInternalHost("verity-ai-git-handwriting-akshitg19.vercel.app"))
      .toBe(true);
    expect(resolveHandwritingExperienceExperiment(
      location("verity-ai-lovat.vercel.app", "?hwr_ab=legacy")
    ).enabled).toBe(false);
  });

  it("leaves normal and unknown query values on the safe current behavior", () => {
    expect(resolveHandwritingExperienceExperiment(
      location("localhost", "")
    )).toMatchObject({
      enabled: false,
      quietPeriodMs: 750,
      maxRecognitionConcurrency: 2,
    });
    expect(resolveHandwritingExperienceExperiment(
      location("localhost", "?hwr_ab=other")
    ).enabled).toBe(false);
  });

  it("reuses one anonymous token only within the browser session", () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const crypto = {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    };

    expect(getOrCreateHandwritingExperimentPairToken({ storage, crypto }))
      .toBe("00000000-0000-4000-8000-000000000001");
    crypto.randomUUID = () => "00000000-0000-4000-8000-000000000002";
    expect(getOrCreateHandwritingExperimentPairToken({ storage, crypto }))
      .toBe("00000000-0000-4000-8000-000000000001");
  });

  it("fails closed when a secure pairing token cannot be generated", () => {
    const values = new Map();
    expect(() => getOrCreateHandwritingExperimentPairToken({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
      crypto: { randomUUID: () => "predictable" },
    })).toThrow(/secure experiment pairing token/);
  });

  it("fails closed when session storage cannot retain the pairing token", () => {
    expect(() => getOrCreateHandwritingExperimentPairToken({
      storage: null,
      crypto: {
        randomUUID: () => "00000000-0000-4000-8000-000000000001",
      },
    })).toThrow(/Session storage is required/);
  });
});
