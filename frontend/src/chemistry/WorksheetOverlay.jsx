import { DEFAULT_LINE_HEIGHT } from "../canvas/geometry";
import { FONT, PAPER, RADIUS, SUBJECTS, VERDICT_STYLES } from "../theme";
import { rowBand } from "./worksheet";

// The worksheet, drawn on the page.
//
// Under the ink, never over it: nothing here takes a pointer, so writing in a
// box is writing on the page as normal and the canvas below does not have to
// know these exist.
//
// The unit is printed outside its box. A student writing a molar mass writes
// `342.15` and never `342.15 g/mol`, because the unit is a fact about the
// question and not about their answer -- which also closes the "units are
// optional and ignored" finding, from the front rather than by tightening a
// parser against handwriting.

const accent = SUBJECTS.chemistry.accent;

function Caption({ top, left = 10, color = PAPER.muted, children }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color,
        pointerEvents: "none",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

function Box({ top, left, width, height, filled, tone }) {
  return (
    <div
      style={{
        position: "absolute",
        boxSizing: "border-box",
        top,
        left,
        width,
        height,
        border: `1.5px ${filled ? "solid" : "dashed"} ${
          tone ?? (filled ? accent : PAPER.line)
        }`,
        borderRadius: RADIUS.sm,
        background: filled ? "transparent" : PAPER.fill,
        pointerEvents: "none",
      }}
    />
  );
}

export default function WorksheetOverlay({
  worksheet,
  values = {},
  answerText = "",
  answerVerdict = null,
  width,
  lineHeight = DEFAULT_LINE_HEIGHT,
}) {
  if (!worksheet || !width) return null;

  const left = 8;
  const boxWidth = Math.max(120, width - 16);
  const promptWidth = Math.min(360, boxWidth);
  const working = rowBand(worksheet.workingStart, worksheet.workingRows, lineHeight);
  const hasAnswer = worksheet.answerRow !== null;
  const answer = hasAnswer
    ? rowBand(worksheet.answerRow, 1, lineHeight)
    : { top: working.top + working.height, height: 0 };

  // Green or red on the answer box itself, so the result is where the student
  // is looking rather than only in a panel off to the side.
  const status = answerVerdict?.status ?? (answerVerdict?.valid ? "valid" : null);
  const answerTone = status ? VERDICT_STYLES[status]?.color : null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height: answer.top + answer.height + (hasAnswer ? lineHeight : 0),
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {worksheet.prompts.map((prompt) => {
        const band = rowBand(prompt.row, 1, lineHeight);
        const filled = Boolean(String(values[prompt.key] ?? "").trim());
        // The heading sits on the first row, so that box starts past it. A
        // box for a whole written line then runs to the right margin, so a
        // long equation and its caption both fit.
        const boxLeft = prompt.row === 0 ? left + titleWidth(worksheet.title) : left;
        const boxWidthHere = prompt.wide
          ? Math.max(160, left + boxWidth - boxLeft)
          : Math.max(140, Math.min(promptWidth, left + promptWidth - boxLeft));
        return (
          <div key={prompt.key}>
            {/* "Molar mass:" once, against the first box, so the page says
                what it is asking without a panel having to. */}
            {prompt.row === 0 && (
              <div
                style={{
                  position: "absolute",
                  top: band.top + 14,
                  left,
                  fontSize: 17,
                  fontWeight: 700,
                  color: PAPER.ink,
                  fontFamily: FONT.sans,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {worksheet.title}:
              </div>
            )}
            <Box
              top={band.top + 6}
              left={boxLeft}
              width={boxWidthHere}
              height={band.height - 10}
              filled={filled}
            />
            {/* Before it is filled the caption says what to write and, where
                it is not obvious, what it is for. "Write the amounts here"
                does not tell anyone which amounts. */}
            <Caption top={band.top + 9} left={boxLeft + 8}>
              {filled ? prompt.label : prompt.prompt}
            </Caption>
            {prompt.unit && (
              <div
                style={{
                  position: "absolute",
                  top: band.top + band.height - 26,
                  left: boxLeft + boxWidthHere + 10,
                  fontSize: 13,
                  fontWeight: 600,
                  color: PAPER.muted,
                  pointerEvents: "none",
                }}
              >
                {prompt.unit}
              </div>
            )}
          </div>
        );
      })}

      {/* The working. It grows as you write and it is never read, so nothing
          in here is ever marked wrong. */}
      <Box
        top={working.top + 4}
        left={left}
        width={boxWidth}
        height={working.height - 8}
        filled={false}
      />
      {/* Never says "not checked". It reads as a broken feature and invites
          skipping the working, which is the part they are meant to be
          doing, and on a steps page it is not even true. */}
      <Caption top={working.top + 8}>{worksheet.workingLabel}</Caption>

      {hasAnswer && (
        <>
          <Box
            top={answer.top + 4}
            left={left}
            width={Math.min(300, boxWidth)}
            height={answer.height - 8}
            filled={Boolean(answerText.trim())}
            tone={answerTone}
          />
          <Caption
            top={answer.top + 8}
            left={left + 8}
            color={answerTone ?? accent}
          >
            Answer
          </Caption>
        </>
      )}
      {hasAnswer && worksheet.answerUnit && (
        <div
          style={{
            position: "absolute",
            top: answer.top + answer.height - 30,
            left: left + Math.min(300, boxWidth) + 12,
            fontSize: 16,
            fontWeight: 600,
            color: PAPER.muted,
            fontFamily: FONT.sans,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {worksheet.answerUnit}
        </div>
      )}
    </div>
  );
}

// The heading sits on the same row as the first box, so the box has to start
// past it. Measured from the string rather than a ref: this renders under the
// ink on every stroke, and a layout read there would cost a frame each time.
function titleWidth(title = "") {
  return Math.round(title.length * 9.5) + 18;
}
