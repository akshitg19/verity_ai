// The product shot, drawn rather than screenshotted.
//
// A screenshot would be out of date the next time the panel moves, and a
// photo of a tablet says nothing about what the app does. This says the whole
// thing in one picture: handwriting on ruled paper, the question marked as
// the question, one line flagged, the others left alone.
//
// Every colour here is fixed rather than themed, and that is deliberate. The
// paper stays light in both themes, so anything drawn on it has to stay dark
// whatever the rest of the page is doing. Using the theme's text colour meant
// the handwriting turned white on cream in dark mode and vanished.
const PAPER = "#f0ede4";
const INK = "#1f2926";
const RULE = "rgba(120, 150, 190, 0.38)";
const MUTED = "#6b6a65";
const GREEN = "#0F6E56";
const GREEN_TINT = "#dcefe7";
const RED = "#c0473f";
const RED_TINT = "#fbeae8";

export default function NotebookMock() {
  const ruled = [0, 1, 2, 3, 4, 5];

  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 560,
        aspectRatio: "8 / 5",
        background: PAPER,
        borderRadius: 16,
        border: "1px solid rgba(27, 28, 26, 0.10)",
        boxShadow: "var(--v-shadow-card)",
        overflow: "hidden",
      }}
    >
      <svg viewBox="0 0 560 350" width="100%" height="100%" role="presentation">
        {ruled.map((row) => (
          <line
            key={row}
            x1="0"
            x2="560"
            y1={62 + row * 52}
            y2={62 + row * 52}
            stroke={RULE}
            strokeWidth="1"
          />
        ))}

        {/* The question, marked as such. */}
        <rect x="30" y="18" width="252" height="36" rx="8"
              fill={GREEN_TINT} stroke={GREEN} strokeWidth="1.2" />
        <text x="42" y="42" fontSize="17" fontFamily="ui-monospace, Menlo, monospace"
              fill={GREEN} fontWeight="600">N₂ + H₂ → NH₃</text>
        <text x="292" y="41" fontSize="11" fontFamily="system-ui, sans-serif"
              fill={MUTED}>the question</text>

        {/* Two lines of working. */}
        <text x="42" y="98" fontSize="19" fontFamily="ui-monospace, Menlo, monospace"
              fill={INK}>N₂ + H₂ → NH₃</text>
        <circle cx="330" cy="91" r="10" fill="#2f9268" />
        <path d="M325 91 l4 4 l7 -8" stroke="#fff" strokeWidth="2" fill="none"
              strokeLinecap="round" strokeLinejoin="round" />

        <text x="42" y="150" fontSize="19" fontFamily="ui-monospace, Menlo, monospace"
              fill={INK}>N₂ + 2H₂ → 2NH₃</text>
        <circle cx="330" cy="143" r="10" fill={RED} />
        <text x="327" y="148" fontSize="13" fontFamily="system-ui, sans-serif" fill="#fff"
              fontWeight="700">!</text>
        <line x1="36" y1="160" x2="300" y2="160"
              stroke={RED} strokeWidth="2.5" strokeLinecap="round" />

        {/* What it says about the marked line. */}
        <rect x="36" y="176" width="380" height="62" rx="10"
              fill={RED_TINT} stroke={RED} strokeWidth="1" strokeOpacity="0.35" />
        <text x="50" y="198" fontSize="11" fontFamily="system-ui, sans-serif" fontWeight="700"
              fill={RED} letterSpacing="0.6">LINE 2</text>
        <text x="50" y="216" fontSize="12.5" fontFamily="system-ui, sans-serif" fill={INK}>
          You balanced the hydrogens, but that changed the
        </text>
        <text x="50" y="232" fontSize="12.5" fontFamily="system-ui, sans-serif" fill={INK}>
          nitrogen count on the right. Count them again.
        </text>

        {/* The line they have not written yet. */}
        <line x1="42" y1="270" x2="44" y2="290" stroke={INK}
              strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      </svg>
    </div>
  );
}
