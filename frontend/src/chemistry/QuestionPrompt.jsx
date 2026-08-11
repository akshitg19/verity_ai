import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { COLORS, RADIUS, SHADOW, SUBJECTS } from "../theme";

const CARD_WIDTH = 268;
const GAP = 12;

// The offer that turns written ink into the problem statement.
//
// Shaped like the iOS text-selection menu on purpose: it appears beside what
// it is talking about, says one thing, and goes away. Two actions, not five.
// A student's first instinct is to write the question on the page, and making
// them type it into a panel instead puts a seam down the middle of a
// handwriting app.
export default function QuestionPrompt({ bounds, text, onUseAsQuestion, onDismiss }) {
  const promptRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const visible = Boolean(bounds && text?.trim());

  useEffect(() => {
    if (!visible) return undefined;
    restoreFocusRef.current = document.activeElement;
    requestAnimationFrame(() => promptRef.current?.querySelector("button")?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [visible, onDismiss]);

  useLayoutEffect(() => {
    if (!visible || !bounds || !promptRef.current) return;
    const prompt = promptRef.current;
    const parent = prompt.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const card = prompt.getBoundingClientRect();
    const gap = GAP;
    const preferredTop = bounds.minY > card.height + 24
      ? bounds.minY - gap - card.height
      : bounds.maxY + gap;
    const next = {
      top: Math.max(8, Math.min(preferredTop, Math.max(8, parent.height - card.height - 8))),
      left: Math.max(8, Math.min(bounds.minX - 6, Math.max(8, parent.width - card.width - 8))),
    };
    setPosition((current) => current.top === next.top && current.left === next.left ? current : next);
  }, [bounds, text, visible]);

  if (!visible) return null;

  return (
    <div
      ref={promptRef}
      role="dialog"
      aria-modal="false"
      aria-describedby="question-prompt-copy"
      aria-label="Use this line as the question"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        width: CARD_WIDTH,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100dvh - 16px)",
        overflowY: "auto",
        zIndex: 15,
        padding: 12,
        boxSizing: "border-box",
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.float,
        fontFamily: "inherit",
      }}
    >
        <div
          id="question-prompt-copy"
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: SUBJECTS.chemistry.accent,
          marginBottom: 5,
        }}
      >
        Is this the question?
      </div>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          color: COLORS.text,
          background: COLORS.background,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.sm,
          padding: "6px 8px",
          marginBottom: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onUseAsQuestion}
          style={{
            flex: 1,
            padding: "9px 10px",
            background: SUBJECTS.chemistry.accent,
            color: "#fff",
            border: "none",
            borderRadius: RADIUS.sm,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Use as question
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            flex: 1,
            padding: "9px 10px",
            background: COLORS.surface,
            color: COLORS.muted,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.sm,
            fontSize: 13,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          It's my working
        </button>
      </div>
    </div>
  );
}
