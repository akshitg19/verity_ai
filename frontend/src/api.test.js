import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiTimeoutError, checkSteps, getHint } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function response(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  };
}

describe("API request wrapper", () => {
  it("normalizes JSON HTTP errors and forwards abort signals", async () => {
    const fetchMock = vi.fn(async () => response({ detail: "Bad problem" }, { ok: false, status: 422, statusText: "Unprocessable" }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(checkSteps("x", [], { signal: controller.signal })).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "Bad problem",
    });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("turns a recoverable response error into ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ error: "Try again" })));
    await expect(getHint({ level: 1 })).rejects.toBeInstanceOf(ApiError);
  });

  it("keeps the timeout active while a response body stalls", async () => {
    vi.useFakeTimers();
    const body = new Promise(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: () => body })));

    const request = getHint({ level: 1 }, { timeoutMs: 25 });
    const expectation = expect(request).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out when fetch itself never resolves", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const request = getHint({ level: 1 }, { timeoutMs: 25 });
    const expectation = expect(request).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });

  it("preserves an external cancellation through body parsing", async () => {
    const controller = new AbortController();
    const body = new Promise(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: () => body })));

    const request = getHint({ level: 1 }, { signal: controller.signal, timeoutMs: 5000 });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
