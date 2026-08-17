import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearGoogleIdToken,
  getGoogleIdToken,
  setGoogleIdToken,
  subscribeToGoogleIdToken,
} from "./tokenStore";

afterEach(() => clearGoogleIdToken());

describe("Google ID token memory store", () => {
  it("keeps the credential in memory and can clear it", () => {
    setGoogleIdToken(" signed.jwt.token ");
    expect(getGoogleIdToken()).toBe("signed.jwt.token");

    clearGoogleIdToken();
    expect(getGoogleIdToken()).toBe("");
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToGoogleIdToken(listener);

    setGoogleIdToken("signed.jwt.token");
    unsubscribe();
    clearGoogleIdToken();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("signed.jwt.token");
  });
});
