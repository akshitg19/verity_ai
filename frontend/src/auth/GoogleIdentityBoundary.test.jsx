import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import GoogleIdentityBoundary from "./GoogleIdentityBoundary";
import { clearGoogleIdToken } from "./tokenStore";


let root;
let container;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  clearGoogleIdToken();
  delete globalThis.google;
});

async function render(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
}

describe("GoogleIdentityBoundary", () => {
  it("does nothing when the preview has no OAuth client configuration", async () => {
    await render(
      <GoogleIdentityBoundary clientId="">
        <p>workspace</p>
      </GoogleIdentityBoundary>
    );

    expect(container.textContent).toBe("workspace");
    expect(document.querySelector("script[data-verity-google-identity]")).toBe(null);
  });

  it("gates the workspace, accepts a credential, and supports sign out", async () => {
    let credentialCallback;
    const initialize = vi.fn((options) => {
      credentialCallback = options.callback;
    });
    const renderButton = vi.fn((element) => {
      element.textContent = "Google button";
    });
    const disableAutoSelect = vi.fn();
    globalThis.google = {
      accounts: { id: { initialize, renderButton, disableAutoSelect } },
    };

    await render(
      <GoogleIdentityBoundary clientId="preview.apps.googleusercontent.com">
        <p>workspace</p>
      </GoogleIdentityBoundary>
    );

    expect(container.textContent).toContain("Sign in to verity.ai");
    expect(container.textContent).not.toContain("workspace");
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(renderButton).toHaveBeenCalledTimes(1);

    await act(async () => credentialCallback({ credential: "signed.jwt.token" }));
    expect(container.textContent).toContain("workspace");

    const signOut = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Sign out");
    await act(async () => signOut.click());

    expect(disableAutoSelect).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Sign in to verity.ai");
    expect(container.textContent).not.toContain("workspace");
    expect(renderButton).toHaveBeenCalledTimes(2);
  });
});
