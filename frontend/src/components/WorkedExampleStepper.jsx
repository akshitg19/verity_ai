import { useState } from "react";

import { COLORS, FONT, RADIUS, SUBJECTS } from "../theme";
import { atomTally, parseEquation } from "../chemistry/equationModel";

// Level 2, shown rather than listed.
//
// A worked example printed as five lines of text is a paragraph a student
// skims. One step at a time, with the atom counts moving as coefficients
// appear, is the thing that actually explains balancing. This is what a
// teacher does at a whiteboard and it is why the rung exists.

function AtomTally({ text, previous }) {
  const rows = atomTally(text);
  if (!rows) return null;
  const before = previous ? atomTally(previous) : null;

  const wasBalanced = (element) =>
    before?.find((row) => row.element === element)?.balanced ?? false;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 10,
      }}
    >
      {rows.map((row) => {
        const justBalanced = row.balanced && !wasBalanced(row.element);
        return (
          <div
            key={row.element}
            title={`${row.element}: ${row.left} on the left, ${row.right} on the right`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 9px",
              borderRadius: RADIUS.pill,
              fontFamily: FONT.mono,
              fontSize: 12,
              background: row.balanced ? "var(--v-valid-bg)" : "var(--v-unsupported-bg)",
              color: row.balanced ? "var(--v-valid)" : "var(--v-unsupported)",
              border: `1px solid ${row.balanced ? "var(--v-valid-border)" : "var(--v-unsupported-border)"}`,
              transition: "background 240ms ease, color 240ms ease",
              animation: justBalanced ? "verity-pop 380ms ease" : undefined,
            }}
          >
            <strong>{row.element}</strong>
            <span>
              {row.left} / {row.right}
            </span>
            <span aria-hidden="true">{row.balanced ? "✓" : "≠"}</span>
          </div>
        );
      })}
    </div>
  );
}

// The equation, with any coefficient that changed on this step called out.
function EquationLine({ text, previous }) {
  const equation = parseEquation(text);
  if (!equation) return null;

  const before = previous ? parseEquation(previous) : null;
  const changed = (side, index, coefficient) => {
    const old = before?.[side]?.[index]?.coefficient;
    return old !== undefined && old !== coefficient;
  };

  const renderSide = (side, terms) =>
    terms.map((term, index) => (
      <span key={`${side}-${index}`}>
        {index > 0 && <span style={{ color: COLORS.muted }}> + </span>}
        {term.coefficient !== 1 && (
          <span
            style={{
              color: changed(side, index, term.coefficient)
                ? SUBJECTS.chemistry.accent
                : COLORS.text,
              fontWeight: changed(side, index, term.coefficient) ? 800 : 600,
              animation: changed(side, index, term.coefficient)
                ? "verity-pop 380ms ease"
                : undefined,
              display: "inline-block",
            }}
          >
            {term.coefficient}
          </span>
        )}
        <span>{term.formula}</span>
      </span>
    ));

  return (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 15,
        lineHeight: 1.6,
        color: COLORS.text,
        wordBreak: "break-word",
      }}
    >
      {renderSide("left", equation.left)}
      <span style={{ color: COLORS.muted, padding: "0 8px" }}>→</span>
      {renderSide("right", equation.right)}
    </div>
  );
}

export default function WorkedExampleStepper({ example }) {
  const steps = example?.steps ?? [];
  // Reset happens by remount, keyed on the example in HintLadder, rather
  // than by a setState inside an effect.
  const [index, setIndex] = useState(0);

  if (!steps.length) return null;

  // The server sends the equation on each step, read by the same parser that
  // judges the student, so the tally is right rather than usually right.
  // Falling back to reading the prose here keeps this working against an
  // older backend, and against the static fallback hint, which has no
  // equations attached.
  const equationFor = (position) =>
    example?.equations?.[position] ?? steps[position] ?? null;

  const current = steps[index];
  const currentEquation = equationFor(index);
  const previousEquation = index > 0 ? equationFor(index - 1) : null;
  const hasEquation = Boolean(currentEquation && parseEquation(currentEquation));

  return (
    <div
      style={{
        marginTop: 10,
        padding: 14,
        borderRadius: RADIUS.md,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <style>{`
        @keyframes verity-pop {
          0%   { transform: scale(1);    }
          40%  { transform: scale(1.35); }
          100% { transform: scale(1);    }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes verity-pop { from, to { transform: none; } }
        }
      `}</style>

      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: COLORS.muted,
          marginBottom: 6,
        }}
      >
        A different problem, worked in full
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4, color: COLORS.text }}>
        {example.problem}
      </div>
      <div style={{ fontSize: 12, color: SUBJECTS.chemistry.accent, marginBottom: 12 }}>
        {example.technique}
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: RADIUS.sm,
          background: COLORS.background,
          border: `1px solid ${COLORS.border}`,
          minHeight: 92,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.muted,
            marginBottom: 6,
          }}
        >
          Step {index + 1} of {steps.length}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: COLORS.text }}>
          {current}
        </div>
        {hasEquation && (
          <div style={{ marginTop: 10 }}>
            <EquationLine text={currentEquation} previous={previousEquation} />
            <AtomTally text={currentEquation} previous={previousEquation} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
          style={{
            padding: "7px 13px",
            background: COLORS.surface,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.sm,
            fontSize: 13,
            fontFamily: FONT.sans,
            opacity: index === 0 ? 0.4 : 1,
            cursor: index === 0 ? "not-allowed" : "pointer",
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setIndex((value) => Math.min(steps.length - 1, value + 1))}
          disabled={index === steps.length - 1}
          style={{
            padding: "7px 15px",
            background: SUBJECTS.chemistry.accent,
            color: "#fff",
            border: "none",
            borderRadius: RADIUS.sm,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: FONT.sans,
            opacity: index === steps.length - 1 ? 0.4 : 1,
            cursor: index === steps.length - 1 ? "not-allowed" : "pointer",
          }}
        >
          Next step
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {steps.map((_, dot) => (
            <span
              key={dot}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: dot <= index ? SUBJECTS.chemistry.accent : COLORS.border,
                transition: "background 200ms ease",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
