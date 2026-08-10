import { COLORS, SURFACES, VERDICT_STYLES } from "../theme";

// The product shot, drawn rather than screenshotted.
//
// A screenshot would be out of date the next time the panel moves, and a
// photo of a tablet says nothing about what the app does. This says the whole
// thing in one picture: handwriting on ruled paper, one line marked, the
// others left alone.
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
        background: SURFACES.paper,
        borderRadius: 16,
        border: `1px solid ${COLORS.border}`,
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
            stroke="var(--v-rule)"
            strokeWidth="1"
          />
        ))}

        {/* The question, marked as such. */}
        <rect x="30" y="18" width="252" height="36" rx="8"
              fill="var(--v-chem-light)" stroke="var(--v-chem)" strokeWidth="1" />
        <text x="42" y="42" fontSize="17" fontFamily="ui-monospace, Menlo, monospace"
              fill="var(--v-chem)">N₂ + H₂ → NH₃</text>
        <text x="292" y="41" fontSize="11" fontFamily="sans-serif"
              fill="var(--v-chem)" opacity="0.85">the question</text>

        {/* Two lines of working that check out. */}
        <text x="42" y="98" fontSize="19" fontFamily="ui-monospace, Menlo, monospace"
              fill="var(--v-text)">N₂ + H₂ → NH₃</text>
        <circle cx="330" cy="91" r="10" fill={VERDICT_STYLES.valid.color} />
        <path d="M325 91 l4 4 l7 -8" stroke="#fff" strokeWidth="2" fill="none"
              strokeLinecap="round" strokeLinejoin="round" />

        <text x="42" y="150" fontSize="19" fontFamily="ui-monospace, Menlo, monospace"
              fill="var(--v-text)">N₂ + 2H₂ → 2NH₃</text>
        <circle cx="330" cy="143" r="10" fill={VERDICT_STYLES.invalid.color} />
        <text x="327" y="148" fontSize="13" fontFamily="sans-serif" fill="#fff"
              fontWeight="700">!</text>
        <line x1="36" y1="160" x2="300" y2="160"
              stroke={VERDICT_STYLES.invalid.color} strokeWidth="2.5"
              strokeLinecap="round" />

        {/* What it says about the marked line. */}
        <rect x="36" y="176" width="380" height="62" rx="10"
              fill="var(--v-invalid-bg)" stroke="var(--v-invalid-border)" strokeWidth="1" />
        <text x="50" y="198" fontSize="11" fontFamily="sans-serif" fontWeight="700"
              fill={VERDICT_STYLES.invalid.color} letterSpacing="0.6">LINE 2</text>
        <text x="50" y="216" fontSize="12.5" fontFamily="sans-serif" fill="var(--v-text)">
          You balanced the hydrogens, but that changed the
        </text>
        <text x="50" y="232" fontSize="12.5" fontFamily="sans-serif" fill="var(--v-text)">
          nitrogen count on the right. Count them again.
        </text>

        {/* The line they have not written yet. */}
        <line x1="42" y1="270" x2="44" y2="290" stroke="var(--v-muted)"
              strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
    </div>
  );
}
