// The palette, as references into the custom properties defined in index.css.
//
// Every value here used to be a literal hex. They are now `var(--v-*)`, which
// is why a theme switch is one attribute on <html> and not a re-render of the
// whole tree: the browser resolves these, so components that never re-render
// still change colour. Every existing `COLORS.surface` call site is untouched.

export const COLORS = {
  background: "var(--v-bg)",
  surface: "var(--v-surface)",
  primary: "var(--v-primary)",
  primaryLight: "var(--v-primary-light)",
  text: "var(--v-text)",
  muted: "var(--v-muted)",
  border: "var(--v-border)",
  danger: "var(--v-danger)",
};

// Paper, sidebar, and the two subject accents. Chemistry gets its own tint
// so the two subjects read as different spaces rather than one surface with
// a toggle on it.
export const SURFACES = {
  paper: "var(--v-paper)",
  sidebar: "var(--v-sidebar)",
  sidebarActive: "var(--v-sidebar-active)",
  overlay: "var(--v-overlay)",
  rule: "var(--v-rule)",
};

export const SUBJECTS = {
  math: {
    label: "Math",
    accent: "var(--v-math)",
    accentLight: "var(--v-math-light)",
    glyph: "∑",
  },
  chemistry: {
    label: "Chemistry",
    accent: "var(--v-chem)",
    accentLight: "var(--v-chem-light)",
    glyph: "⬡",
  },
};

// Four outcomes, four treatments. `unsupported` and `parse_error` are our
// limitations, not the student's mistakes, so neither may borrow the red
// that means "you got this wrong".
export const VERDICT_STYLES = {
  valid: {
    label: "Correct",
    color: "var(--v-valid)",
    background: "var(--v-valid-bg)",
    border: "var(--v-valid-border)",
    symbol: "✓",
  },
  invalid: {
    label: "Review this",
    color: "var(--v-invalid)",
    background: "var(--v-invalid-bg)",
    border: "var(--v-invalid-border)",
    symbol: "!",
  },
  unsupported: {
    label: "Can't check this yet",
    color: "var(--v-unsupported)",
    background: "var(--v-unsupported-bg)",
    border: "var(--v-unsupported-border)",
    symbol: "?",
  },
  parse_error: {
    label: "Couldn't read this",
    color: "var(--v-parse)",
    background: "var(--v-parse-bg)",
    border: "var(--v-parse-border)",
    symbol: "~",
  },
  waiting: {
    label: "Not checked yet",
    color: "var(--v-waiting)",
    background: "var(--v-waiting-bg)",
    border: "var(--v-waiting-border)",
    symbol: "…",
  },
};

export const RADIUS = { sm: 8, md: 10, lg: 14, xl: 18, pill: 999 };
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const SHADOW = {
  card: "var(--v-shadow-card)",
  raised: "var(--v-shadow-raised)",
  float: "var(--v-shadow-float)",
};
export const FONT = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

export function verdictStyle(status) {
  return VERDICT_STYLES[status] ?? VERDICT_STYLES.waiting;
}

// --- theme ------------------------------------------------------------------

// v2, and the bump is the point: every device that had already stored
// "system" re-defaults to light once. See DEFAULT_PREFERENCE below.
export const THEME_STORAGE_KEY = "verity.theme.v2";
export const THEME_PREFERENCES = ["system", "light", "dark"];

// Light, not system.
//
// Dark mode is half a theme: the paper deliberately stays light because the
// ink does not invert with it, so a dark-mode tablet showed a light ruled page
// inside black chrome, with a black feedback panel hanging off the side of it.
// That is not a look anyone chose, and a student on a device set to dark got
// it without asking. Dark stays one tap away for anyone who wants it, and it
// becomes the sensible default again the day the paper and the ink invert
// together.
export const DEFAULT_PREFERENCE = "light";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemTheme() {
  return globalThis.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

// A preference is what the student chose; a theme is what that resolves to
// right now. "system" is the only one where the two can differ.
export function resolveTheme(preference) {
  return preference === "system" ? systemTheme() : preference;
}

export function readStoredPreference() {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    return THEME_PREFERENCES.includes(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    // Private browsing can throw on access rather than return null.
    return DEFAULT_PREFERENCE;
  }
}

export function applyTheme(preference) {
  const theme = resolveTheme(preference);
  const root = globalThis.document?.documentElement;
  if (root) root.dataset.theme = theme;
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not being able to remember the choice is not a reason to fail to apply it.
  }
  return theme;
}

// Canvas needs real colours: a 2D context cannot resolve `var()`. Reading them
// back from the root element keeps index.css the single source of truth
// instead of a second copy of the palette living in the canvas code.
export function readCanvasPalette() {
  const root = globalThis.document?.documentElement;
  if (!root || !globalThis.getComputedStyle) {
    return { paper: "#faf8f2", rule: "rgba(120, 150, 190, 0.4)", ink: "#1f2926" };
  }
  const style = globalThis.getComputedStyle(root);
  const read = (name, fallback) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    paper: read("--v-paper", "#faf8f2"),
    rule: read("--v-rule", "rgba(120, 150, 190, 0.4)"),
    ink: read("--v-ink", "#1f2926"),
  };
}
