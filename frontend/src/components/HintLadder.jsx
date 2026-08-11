import { useEffect, useRef, useState } from "react";

import { COLORS, FONT, RADIUS } from "../theme";
import WorkedExampleStepper from "./WorkedExampleStepper";
import { safeHintResourceUrl } from "./hintResources";

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

// How many hints remain on this line, keyed by the level already taken. The
// wording gets shorter and firmer as they run out, because the point is that
// the help is finite and the student is going to finish this themselves.
const HINTS_LEFT = {
  0: "3 hints for this line",
  1: "2 more hints",
  2: "Last hint",
  3: "That was the last hint. The rest is yours",
};

// What is being fetched, by the level being fetched. This used to be the one
// string "Working through a fresh example", which announced level 2 while
// level 1 was still loading and told the student the wrong thing about what
// they had just asked for.
const LOADING_LABELS = {
  1: "Finding where it went wrong…",
  2: "Working through a fresh example…",
  3: "Working through your own step…",
};

export default function HintLadder({
  level,
  hint,
  workedExample,
  terminalStep,
  source,
  resource,
  error,
  loading,
  onRequest,
  onCancel,
  disabled,
}) {
  const atTop = level >= 3;
  const nextLabel = NEXT_LABELS[level] ?? "Show another hint";
  const [open, setOpen] = useState(readHintsOpen);
  const hintRef = useRef(null);
  const safeResource = safeHintResourceUrl(resource);

  // A hint arrives at the bottom of a panel the student is not looking at,
  // below whatever working is already listed above it. On a tablet that is
  // reliably off the fold, so the help they just asked for appears somewhere
  // they cannot see. Bring it to them instead of making them find it.
  useEffect(() => {
    if (!hint) return;
    hintRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [hint, level]);

  const setOpenAndRemember = (next) => {
    setOpen(next);
    rememberHintsOpen(next);
  };

  if (!open) {
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
          {level > 0 ? "Show hints" : "Stuck? Get a hint"}
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
            background: terminalStep ? "var(--v-unsupported-bg)" : COLORS.primaryLight,
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
                color: terminalStep ? "var(--v-unsupported)" : COLORS.primary,
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {terminalStep
                ? "Last step, you finish it"
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

          {safeResource && (
            <a
              href={safeResource}
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

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 10,
            padding: 12,
            borderRadius: RADIUS.md,
            background: "var(--v-parse-bg)",
            color: COLORS.text,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <div>That hint did not load. Your hint level was not used.</div>
          <button
            type="button"
            onClick={onRequest}
            disabled={loading || disabled}
            style={{
              marginTop: 8,
              minHeight: 44,
              padding: "8px 12px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm,
              background: COLORS.surface,
              color: COLORS.primary,
              fontWeight: 700,
              cursor: loading || disabled ? "not-allowed" : "pointer",
            }}
          >
            Retry hint
          </button>
        </div>
      )}

      {/* The worked example sits beside the hint rather than inside it. It was
          nested in the tinted bubble, which squeezed a stepper, an equation
          and a row of atom counts into a box sized for two sentences. It is
          its own thing and now reads as its own thing. */}
      {workedExample && (
        <WorkedExampleStepper
          key={workedExample.problem}
          example={workedExample}
        />
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
            {LOADING_LABELS[level + 1] ?? "Working on it…"}
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
            background: disabled || atTop ? "var(--v-waiting-bg)" : COLORS.primary,
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

      {/* How many hints are left on this line.
       *
       * This used to print `level_3_remaining` from the session, which is a
       * real server-side counter for a mechanism that is currently switched
       * off: `hints.spend_level_3` only runs when WITHHOLD_ANSWER is on, and
       * it is not. So it sat at "3 walk-throughs left for this problem" and
       * never moved, including after the student had taken all three hints.
       * A counter that does not count is worse than no counter, because it
       * teaches the student to ignore the one place we warn them.
       *
       * So this counts the ladder itself, which is enforced and visible:
       * three hints per line, each a different kind of help, and the last one
       * is the last one. If the budget is ever re-armed, this is the place to
       * bring `levelThreeRemaining` back, and it will mean something then. */}
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          fontWeight: atTop ? 700 : 600,
          color: atTop ? "var(--v-unsupported)" : COLORS.muted,
          textAlign: "center",
        }}
      >
        {HINTS_LEFT[level] ?? HINTS_LEFT[0]}
      </div>
    </div>
  );
}
