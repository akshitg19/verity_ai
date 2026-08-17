import { useEffect, useRef, useState } from "react";

import {
  clearGoogleIdToken,
  getGoogleIdToken,
  setGoogleIdToken,
  subscribeToGoogleIdToken,
} from "./tokenStore";
import "./googleIdentityBoundary.css";

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const DEFAULT_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();

let scriptPromise;
let initializedClientId = "";

function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.id) {
    return Promise.resolve(globalThis.google.accounts.id);
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    let script = document.querySelector("script[data-verity-google-identity]");
    let timeout;
    const loaded = () => {
      clearTimeout(timeout);
      if (globalThis.google?.accounts?.id) resolve(globalThis.google.accounts.id);
      else reject(new Error("Google Identity Services did not initialize"));
    };
    const failed = () => {
      clearTimeout(timeout);
      reject(new Error("Google Identity Services failed to load"));
    };

    if (!script) {
      script = document.createElement("script");
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.dataset.verityGoogleIdentity = "true";
      script.addEventListener("load", loaded, { once: true });
      script.addEventListener("error", failed, { once: true });
      timeout = setTimeout(failed, 15_000);
      document.head.appendChild(script);
      return;
    }
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    timeout = setTimeout(failed, 15_000);
  });
  return scriptPromise;
}

function initializeGoogleIdentity(identity, clientId) {
  if (initializedClientId && initializedClientId !== clientId) {
    throw new Error("Google Identity Services was initialized for another client");
  }
  if (!initializedClientId) {
    identity.initialize({
      client_id: clientId,
      callback: (response) => {
        if (typeof response?.credential === "string" && response.credential.trim()) {
          setGoogleIdToken(response.credential);
        }
      },
    });
    initializedClientId = clientId;
  }
}

export default function GoogleIdentityBoundary({
  children,
  clientId = DEFAULT_CLIENT_ID,
}) {
  const [token, setToken] = useState(getGoogleIdToken);
  const [loadError, setLoadError] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => subscribeToGoogleIdToken(setToken), []);

  useEffect(() => {
    if (!clientId || token) return undefined;
    let cancelled = false;

    loadGoogleIdentity()
      .then((identity) => {
        if (cancelled || !buttonRef.current) return;
        initializeGoogleIdentity(identity, clientId);
        buttonRef.current.replaceChildren();
        identity.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "sign_in_with",
          shape: "rectangular",
          width: Math.min(320, Math.max(220, globalThis.innerWidth - 48)),
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, token]);

  if (!clientId) return children;

  if (!token) {
    return (
      <main className="identity-gate">
        <section className="identity-card" aria-labelledby="identity-title">
          <div className="identity-mark" aria-hidden="true">V</div>
          <p className="identity-eyebrow">Team preview</p>
          <h1 id="identity-title">Sign in to verity.ai</h1>
          <p className="identity-copy">
            Use an approved Google account to open this private handwriting preview.
          </p>
          <div ref={buttonRef} className="identity-google-button" />
          {loadError && (
            <p className="identity-error" role="alert">
              Sign-in could not be loaded. Check the connection and refresh.
            </p>
          )}
        </section>
      </main>
    );
  }

  const signOut = () => {
    globalThis.google?.accounts?.id?.disableAutoSelect?.();
    clearGoogleIdToken();
  };

  return (
    <>
      {children}
      <button className="identity-sign-out" type="button" onClick={signOut}>
        Sign out
      </button>
    </>
  );
}
