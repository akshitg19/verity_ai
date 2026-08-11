// The mark: a radical sign that finishes as a check, with an electron orbit
// around its vertex.
//
// It carries both subjects in one shape. The radical and the tick are maths
// and a verdict; the orbit is chemistry. The vertex is where the two meet,
// which is also where the product does its work: the moment a line is read
// and marked.
//
// Everything is drawn in `currentColor`, so a caller sets the colour by
// setting `color`. That is what makes the reversed lockup free: the same
// component on a dark surface with color set to white.

export function LogoMark({ size = 40, strokeWidth = 6.5, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="verity.ai"
      style={{ display: "block", flexShrink: 0, color: "inherit", ...style }}
    >
      {/* The orbit sits behind the stroke so the tick reads first. */}
      <ellipse
        cx="21"
        cy="45"
        rx="16"
        ry="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth * 0.52}
        opacity="0.55"
        transform="rotate(-28 21 45)"
      />
      <path
        d="M8 34 L21 45 L40 12 L57 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21" cy="45" r={strokeWidth * 0.6} fill="currentColor" />
    </svg>
  );
}

// The mark in a filled tile, for a favicon or an app icon where the shape
// needs its own background to sit on.
export function LogoTile({ size = 38, radius = 10, background, foreground = "#fff" }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        borderRadius: radius,
        background: background ?? "var(--v-primary)",
        color: foreground,
      }}
    >
      <LogoMark size={size * 0.72} strokeWidth={7.5} />
    </span>
  );
}

// Mark plus wordmark, and the tagline when there is room for it.
export default function Logo({
  size = 40,
  showWordmark = false,
  showTagline = false,
  accent,
  style,
}) {
  if (!showWordmark) {
    return (
      <span style={{ color: accent ?? "var(--v-primary)", display: "block", ...style }}>
        <LogoMark size={size} />
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.3,
        color: accent ?? "var(--v-primary)",
        ...style,
      }}
    >
      <LogoMark size={size} />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span
          style={{
            fontSize: size * 0.62,
            fontWeight: 600,
            letterSpacing: -0.6,
            color: "currentColor",
          }}
        >
          verity.ai
        </span>
        {showTagline && (
          <span
            style={{
              marginTop: size * 0.13,
              fontSize: size * 0.26,
              fontWeight: 500,
              letterSpacing: 0.2,
              color: "var(--v-muted)",
            }}
          >
            think it through
          </span>
        )}
      </span>
    </span>
  );
}
