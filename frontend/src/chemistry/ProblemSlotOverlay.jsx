import { DEFAULT_LINE_HEIGHT } from "../canvas/geometry";
import { COLORS, RADIUS, SUBJECTS } from "../theme";
import { PAIR_SPLIT_RATIO, SLOT_KINDS, workingStartRow } from "./problemSlots";

// The problem, drawn as boxes on the page.
//
// These sit under the ink, not over it, so writing into one is writing on the
// page as normal. They are a guide, not a control: nothing here handles a
// pointer, and the canvas below never has to know they exist.
//
// The unit is printed outside its box, to the right, greyed. A student
// writing a mass writes `25.0` and never `25.0 g`, because the g is a fact
// about the question and not about their answer.

const accent = SUBJECTS.chemistry.accent;

function SlotLabel({ children }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 4,
        left: 8,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: COLORS.muted,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
}

function Unit({ children }) {
  if (!children) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 10,
        bottom: 8,
        fontSize: 13,
        fontWeight: 600,
        color: COLORS.muted,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
}

function boxStyle(filled) {
  return {
    position: "absolute",
    boxSizing: "border-box",
    border: `1.5px ${filled ? "solid" : "dashed"} ${
      filled ? accent : COLORS.border
    }`,
    borderRadius: RADIUS.sm,
    background: filled ? "transparent" : "var(--v-slot-bg, rgba(127,127,127,0.035))",
    pointerEvents: "none",
  };
}

export default function ProblemSlotOverlay({
  layout,
  values = {},
  width,
  lineHeight = DEFAULT_LINE_HEIGHT,
  onAddPairRow,
}) {
  if (!layout?.length || !width) return null;

  const workingTop = workingStartRow(layout) * lineHeight;
  const splitX = width * PAIR_SPLIT_RATIO;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height: workingTop + lineHeight,
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {layout.map((slot) => {
        const filled = Boolean(String(values[slot.key] ?? "").trim());

        if (slot.kind === SLOT_KINDS.PAIRS) {
          // Species on the left, amount on the right, one pair per row. This
          // is the shape a list of amounts actually has, and writing
          // `Al: 25.0` as prose on one line was never going to read reliably.
          return (
            <div key={slot.key}>
              <div
                style={{
                  ...boxStyle(filled),
                  top: slot.top,
                  left: 6,
                  width: width - 12,
                  height: slot.height,
                }}
              />
              <SlotLabel>{slot.label}</SlotLabel>
              {Array.from({ length: slot.rowSpan }).map((_, index) => (
                <div
                  key={index}
                  style={{
                    position: "absolute",
                    top: slot.top + index * lineHeight,
                    left: splitX,
                    width: 1,
                    height: lineHeight,
                    background: COLORS.border,
                    pointerEvents: "none",
                  }}
                />
              ))}
              {slot.unit && (
                <div
                  style={{
                    position: "absolute",
                    right: 14,
                    top: slot.top + 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: COLORS.muted,
                    pointerEvents: "none",
                  }}
                >
                  {slot.unit}
                </div>
              )}
              {onAddPairRow && (
                <button
                  type="button"
                  onClick={onAddPairRow}
                  style={{
                    position: "absolute",
                    top: slot.top + slot.height - 22,
                    left: 10,
                    padding: "2px 8px",
                    minHeight: 0,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 999,
                    background: COLORS.surface,
                    color: COLORS.muted,
                    fontFamily: "inherit",
                    fontSize: 10.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    pointerEvents: "auto",
                  }}
                >
                  + row
                </button>
              )}
            </div>
          );
        }

        return (
          <div key={slot.key}>
            <div
              style={{
                ...boxStyle(filled),
                top: slot.top,
                left: 6,
                width:
                  slot.kind === SLOT_KINDS.LINE ? width - 12 : Math.min(320, width - 12),
                height: slot.height,
              }}
            />
            <div style={{ position: "absolute", top: slot.top, left: 6 }}>
              <SlotLabel>
                {slot.label}
                {slot.optional ? " (optional)" : ""}
              </SlotLabel>
            </div>
            {slot.unit && (
              <div
                style={{
                  position: "absolute",
                  top: slot.top,
                  left: 6,
                  width: Math.min(320, width - 12),
                  height: slot.height,
                }}
              >
                <Unit>{slot.unit}</Unit>
              </div>
            )}
          </div>
        );
      })}

      {/* Where the problem stops and the student starts. Everything below this
          is judged; everything above it is the question. */}
      <div
        style={{
          position: "absolute",
          top: workingTop - 1,
          left: 0,
          width,
          height: 2,
          background: accent,
          opacity: 0.35,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: workingTop + 5,
          left: 8,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: accent,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Your working
      </div>
    </div>
  );
}
