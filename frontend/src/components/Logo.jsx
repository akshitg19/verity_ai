// The mark is a V that is also a check: the product reads work and marks the
// line. One shape, both meanings, and it survives being 16px in a browser tab.
//
// It takes its colour from the active subject accent, so the identity shifts
// with the space the student is in rather than sitting on top of it.
export default function Logo({ size = 38, accent = "var(--v-primary)", radius = 10 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="verity.ai"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width="64" height="64" rx={(radius / size) * 64} fill={accent} />
      <path
        d="M15 25.5 L27.5 45 L49 16"
        fill="none"
        stroke="#ffffff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
