import { useState } from "react";

import { COLORS, FONT, RADIUS } from "../theme";

const HINTS_OPEN_KEY = "verity.hintsOpen";

// Collapsed until asked for. The feedback was that help appearing on screen
// while a student is still writing is disturbing, and a hint nobody asked for
// is exactly the kind of thing that makes a page feel noisy. Opening it is one
// tap, and the choice is remembered for the session.
function readHintsOpen() {
  try {
    return globalThis.sessionStorage?.getItem(HINTS_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberHintsOpen(open) {
  try {
    globalThis.sessionStorage?.setItem(HINTS_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Remembering is a convenience, not a requirement.
  }
}

// The v3 ladder, rendered.
//
// diagnose -> demonstrate -> do it with them. Each rung is a different kind
// of help, so each one looks different: level 2 is a worked example rendered
// as steps rather than a paragraph, and a level-3 refusal on the terminal
// step is a designed message rather than an error state.

const LEVEL_LABELS = {
  1: "Where it went wrong",
  2: "A worked example",
  3: "Walk me through mine",
};

const NEXT_LABELS = {
  0: "Show me where I went wrong",
  1: "Show me a worked example",
  2: "Walk me through my step",
};

function WorkedExample({ example }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: RADIUS.md,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
      }}
    >
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
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: COLORS.text,
          lineHeight: 1.4,
          marginBottom: 4,
        }}
      >
        {example.problem}
      </div>
      <div
        style={{
          fontSize: 12,
          color: COLORS.primary,
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {example.technique}
      </div>

      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {example.steps.map((step, index) => (
          <li
            key={index}
            style={{
              fontFamily: FONT.mono,
              fontSize: 12.5,
              lineHeight: 1.7,
              color: COLORS.text,
            }}
          >
            {step}
          </li>
        ))}
      </ol>

      {example.verified && (
        // Only an example that passed our own deterministic judge, line by
        // line, is ever rendered. Saying so is the point: it is the reason a
        // generated worked example is safe to show at all.
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#267a55",
            fontWeight: 600,
          }}
        >
          ✓ every line checked by the same engine that checks your work
        </div>
      )}
    </div>
  );
}

export default function HintLadder({
  level,
  hint,
  workedExample,
  terminalStep,
  levelThreeRemaining,
  source,
  resource,
  loading,
  onRequest,
  onCancel,
  disabled,
}) {
  const atTop = level >= 3;
  const nextLabel = NEXT_LABELS[level] ?? "Show another hint";
  const spendsBudget = level === 2 && !terminalStep;
  const [open, setOpen] = useState(readHintsOpen);

  const setOpenAndRemember = (next) => {
    setOpen(next);
    rememberHintsOpen(next);
  };

  if (!open && level === 0 && !hint) {
    return (
      <div
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${COLORS.border}`,
          fontFamily: FONT.sans,
        }}
      >
        <button
          type="button"
          onClick={() => setOpenAndRemember(true)}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "9px 14px",
            background: "transparent",
            color: COLORS.muted,
            border: `1px dashed ${COLORS.border}`,
            borderRadius: RADIUS.sm,
            fontSize: 13,
            fontFamily: FONT.sans,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Stuck? Get a hint
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: `1px solid ${COLORS.border}`,
        fontFamily: FONT.sans,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setOpenAndRemember(false)}
          style={{
            background: "transparent",
            border: "none",
            color: COLORS.muted,
            fontSize: 12,
            fontFamily: FONT.sans,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Hide hints
        </button>
      </div>
      {hint && (
        <div
          style={{
            marginBottom: 10,
            padding: 12,
            borderRadius: RADIUS.md,
            background: terminalStep ? "#fdf6e6" : COLORS.primaryLight,
            color: COLORS.text,
            lineHeight: 1.5,
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 5,
            }}
          >
            <div
              style={{
                color: terminalStep ? "#8a6d3b" : COLORS.primary,
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {terminalStep
                ? "Last step — you finish it"
                : `Hint ${level} of 3 · ${LEVEL_LABELS[level] ?? ""}`}
            </div>
            {source === "fallback" && !terminalStep && (
              <span
                title="Generation or verification didn't produce something we could stand behind, so this is the built-in hint."
                style={{ color: COLORS.muted, fontSize: 10, fontWeight: 700 }}
              >
                built-in
              </span>
            )}
          </div>

          {hint}

          {workedExample && <WorkedExample example={workedExample} />}

          {resource && (
            <a
              href={resource}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: 10,
                color: COLORS.primary,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Read more about this →
            </a>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: RADIUS.md,
              background: COLORS.primaryLight,
              color: COLORS.primary,
              fontWeight: 700,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Working through a fresh example…
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "10px 14px",
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                color: COLORS.muted,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          disabled={disabled || atTop}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: disabled || atTop ? "#d8ddda" : COLORS.primary,
            color: "#fff",
            border: "none",
            borderRadius: RADIUS.md,
            fontWeight: 700,
            fontSize: 13,
            cursor: disabled || atTop ? "not-allowed" : "pointer",
          }}
        >
          {atTop ? "That's every hint for this line" : nextLabel}
        </button>
      )}

      {typeof levelThreeRemaining === "number" && (
        // Shown before it is spent, not after. A student deciding whether to
        // escalate should know what it costs.
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: COLORS.muted,
            textAlign: "center",
          }}
        >
          {levelThreeRemaining > 0
            ? `${levelThreeRemaining} walk-through${
                levelThreeRemaining === 1 ? "" : "s"
              } left for this problem`
            : "No walk-throughs left for this problem"}
          {spendsBudget && levelThreeRemaining > 0 && " · the next one uses one"}
        </div>
      )}
    </div>
  );
}
