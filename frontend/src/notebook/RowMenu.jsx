import { useEffect, useRef, useState } from "react";

import { COLORS, FONT, RADIUS, SHADOW } from "../theme";

// The three dots every notes app puts at the end of a row.
//
// Rename, move, delete used to be a double-click, a drag, and a small × that
// a finger misses. Making them a menu is the boring correct answer: it is the
// gesture students already know from Apple Notes, Samsung Notes, Drive and
// Docs, and it is discoverable without a tooltip.

export default function RowMenu({ items, label = "More actions" }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!buttonRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (event) => {
    event.stopPropagation();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 176;
      const height = items.length * 38 + 12;
      setPosition({
        // Flipped up or left when the row is near an edge, so the last item
        // is never off screen on a short tablet in landscape.
        top:
          rect.bottom + height > window.innerHeight
            ? Math.max(8, rect.top - height)
            : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left - width + rect.width, window.innerWidth - width - 8)),
      });
    }
    setOpen((value) => !value);
  };

  return (
    <span ref={buttonRef} style={{ display: "inline-flex" }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={toggle}
        style={{
          width: 26,
          height: 26,
          display: "grid",
          placeItems: "center",
          border: "none",
          borderRadius: RADIUS.sm,
          background: open ? COLORS.border : "transparent",
          color: COLORS.muted,
          fontSize: 15,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            zIndex: 60,
            width: 176,
            padding: "6px 0",
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            boxShadow: SHADOW.float,
            fontFamily: FONT.sans,
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                background: "transparent",
                border: "none",
                textAlign: "left",
                color: item.danger ? COLORS.danger : COLORS.text,
                fontFamily: FONT.sans,
                fontSize: 13,
                opacity: item.disabled ? 0.4 : 1,
                cursor: item.disabled ? "not-allowed" : "pointer",
              }}
            >
              <span aria-hidden="true" style={{ width: 16, fontSize: 13 }}>
                {item.glyph}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
