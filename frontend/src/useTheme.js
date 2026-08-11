import { useCallback, useEffect, useState } from "react";

import { applyTheme, readStoredPreference, systemTheme } from "./theme";

// The inline script in index.html has already stamped data-theme on <html>
// before first paint, so this hook only keeps it in step afterwards. Reading
// the preference here instead would give a flash of the wrong theme on every
// load, which looks broken on a tablet.
//
// The preference is the only React state. The resolved theme lives on the
// document element, which is the external system this effect synchronises --
// holding a second copy in state would just be something else to keep right.
export default function useTheme() {
  const [preference, setPreference] = useState(readStoredPreference);

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  // "System" has to keep following the OS while the tab is open, not only at
  // load: a tablet that flips to dark at sunset should take the app with it.
  useEffect(() => {
    if (preference !== "system") return undefined;
    const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query?.addEventListener) return undefined;
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const cycle = useCallback(() => {
    // Two visible states plus an explicit way back to following the device.
    setPreference((current) => {
      if (current === "system") return systemTheme() === "dark" ? "light" : "dark";
      if (current === "light") return "dark";
      return "system";
    });
  }, []);

  return { preference, setPreference, cycle };
}
