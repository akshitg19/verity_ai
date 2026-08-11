import { useEffect, useRef } from "react";

import { COLORS, RADIUS, SHADOW } from "../theme";

function focusable(root) {
  return [...(root?.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? [])].filter(
    (element) => !element.disabled && element.getAttribute("aria-hidden") !== "true"
  );
}

export default function ActionDialog({ open, title, description, children, onClose }) {
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    const first = focusable(dialogRef.current)[0];
    first?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable(dialogRef.current);
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? index <= 0 ? controls.length - 1 : index - 1
        : index === controls.length - 1 ? 0 : index + 1;
      event.preventDefault();
      controls[nextIndex]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "var(--v-overlay)",
      }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
        aria-describedby={description ? "action-dialog-description" : undefined}
        style={{
          width: "min(100%, 480px)",
          maxHeight: "min(90dvh, 620px)",
          overflowY: "auto",
          boxSizing: "border-box",
          padding: 20,
          background: COLORS.surface,
          color: COLORS.text,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.float,
        }}
      >
        <div id="action-dialog-title" style={{ fontSize: 18, fontWeight: 750 }}>{title}</div>
        {description && (
          <p id="action-dialog-description" style={{ margin: "8px 0 16px", color: COLORS.muted, lineHeight: 1.5 }}>
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
