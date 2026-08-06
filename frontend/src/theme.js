// Extracted from App.jsx so panels do not each drag a copy of the palette.
// The base COLORS object is unchanged -- every existing reference keeps
// working -- and the additions below are what the notebook shell and the
// four-outcome verdict treatments need.

export const COLORS = {
  background: "#f7f6f2",
  surface: "#ffffff",
  primary: "#315e54",
  primaryLight: "#e4f0ed",
  text: "#1f2926",
  muted: "#6f7a76",
  border: "#d9dfdc",
  danger: "#c94b4b",
};

// Paper, sidebar, and the two subject accents. Chemistry gets its own tint
// so the two subjects read as different spaces rather than one surface with
// a toggle on it.
export const SURFACES = {
  paper: "#faf8f2",
  sidebar: "#f2f1ec",
  sidebarActive: "#e6e9e5",
  overlay: "rgba(31, 41, 38, 0.35)",
  rule: "rgba(120, 150, 190, 0.4)",
};

export const SUBJECTS = {
  math: {
    label: "Math",
    accent: "#315e54",
    accentLight: "#e4f0ed",
    glyph: "∑",
  },
  chemistry: {
    label: "Chemistry",
    accent: "#3d5a80",
    accentLight: "#e6edf5",
    glyph: "⬡",
  },
};

// Four outcomes, four treatments. `unsupported` and `parse_error` are our
// limitations, not the student's mistakes, so neither may borrow the red
// that means "you got this wrong".
export const VERDICT_STYLES = {
  valid: {
    label: "Correct",
    color: "#267a55",
    background: "#edf8f2",
    border: "#267a5533",
    symbol: "✓",
  },
  invalid: {
    label: "Review this",
    color: "#c94b4b",
    background: "#fff0f0",
    border: "#c94b4b33",
    symbol: "!",
  },
  unsupported: {
    label: "Can't check this yet",
    color: "#a96b1f",
    background: "#fff7e8",
    border: "#a96b1f33",
    symbol: "?",
  },
  parse_error: {
    label: "Couldn't read this",
    color: "#7a6ba9",
    background: "#f2f0fb",
    border: "#7a6ba933",
    symbol: "~",
  },
  waiting: {
    label: "Not checked yet",
    color: "#6f7a76",
    background: "#f3f5f4",
    border: "#d9dfdc",
    symbol: "…",
  },
};

export const RADIUS = { sm: 8, md: 10, lg: 14, xl: 18, pill: 999 };
export const SHADOW = {
  card: "0 12px 30px rgba(31, 41, 38, 0.12)",
  raised: "0 2px 10px rgba(0, 0, 0, 0.04)",
  float: "0 8px 24px rgba(31, 41, 38, 0.16)",
};
export const FONT = {
  sans: "sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

export function verdictStyle(status) {
  return VERDICT_STYLES[status] ?? VERDICT_STYLES.waiting;
}
