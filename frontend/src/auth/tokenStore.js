// Google ID tokens are credentials. Keep them in memory only: never localStorage,
// IndexedDB, notebook data, analytics, or logs.

let googleIdToken = "";
const listeners = new Set();

export function getGoogleIdToken() {
  return googleIdToken;
}

export function setGoogleIdToken(token) {
  const next = typeof token === "string" ? token.trim() : "";
  if (next === googleIdToken) return;
  googleIdToken = next;
  for (const listener of listeners) listener(googleIdToken);
}

export function clearGoogleIdToken() {
  setGoogleIdToken("");
}

export function subscribeToGoogleIdToken(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
