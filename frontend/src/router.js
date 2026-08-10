import { useEffect, useState } from "react";

// A router small enough to read in one sitting, because the app has exactly
// three routes and pulling in a routing library for that would be more
// configuration than code.
//
// History API rather than hashes, so the URLs are the ones a person would
// type. That needs a rewrite on any host serving the built files, or a deep
// link 404s: vercel.json handles Vercel, and main.py's SPA fallback handles
// the container.

export const ROUTES = ["/", "/math", "/chemistry"];

export function normalisePath(pathname) {
  const trimmed = (pathname || "/").replace(/\/+$/, "") || "/";
  return ROUTES.includes(trimmed) ? trimmed : "/";
}

export function navigate(path) {
  if (globalThis.location?.pathname === path) return;
  globalThis.history?.pushState({}, "", path);
  globalThis.dispatchEvent(new PopStateEvent("popstate"));
}

export default function useRoute() {
  const [path, setPath] = useState(() =>
    normalisePath(globalThis.location?.pathname)
  );

  useEffect(() => {
    const onPop = () => setPath(normalisePath(globalThis.location?.pathname));
    globalThis.addEventListener("popstate", onPop);
    return () => globalThis.removeEventListener("popstate", onPop);
  }, []);

  return path;
}
