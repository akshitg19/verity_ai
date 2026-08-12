import { DEFAULT_LINE_HEIGHT } from "../canvas/geometry";
import { labelWithoutUnit, unitFromLabel } from "./problemSlots";

// The page, laid out as a worksheet: question at the top, working in the
// middle, one answer box at the bottom.
//
// Why this replaces line-by-line judging on numeric topics. A molar mass is
// not a chain of steps that each follow from the one above. It is a lookup,
// some multiplications and an addition, and everybody arranges those
// differently: down the page, across one line, or in their head. Judging
// each row against "is this a quantity in the correct working" was never
// going to survive that, and it produced the two failures that made the
// topic feel broken -- a row with two numbers in it comes back
// `parse_error`, and an intermediate written as the final answer comes back
// `valid`.
//
// So the working is not judged at all. It is a place to work. The answer box
// is judged, and because we now know which line is the answer, an
// intermediate written there is correctly marked wrong -- which is the
// standing "nothing marks a line as the final answer" finding in
// `final_tasks.md`, closed from the front end.
//
// This module is geometry and nothing else: no React, no canvas, no fetch.

export const ZONES = {
  // A field of the question. One row each, filled by writing in the box.
  PROMPT: "prompt",
  // The student's working. Never transcribed, never judged, never sent.
  WORKING: "working",
  // The one line that gets checked.
  ANSWER: "answer",
};

// Enough room to do the arithmetic without the box feeling like a slot, and
// a ceiling so a runaway row count cannot push the answer box off the page.
export const MIN_WORKING_ROWS = 5;
export const MAX_WORKING_ROWS = 30;
// Blank rows kept below the last thing written, so the student never reaches
// the bottom of the box and never has to ask for another line.
const HEADROOM_ROWS = 2;

/**
 * Does this problem type get a worksheet?
 *
 * Numeric topics only for now: their answer is one number, in one box, with
 * one unit, which is exactly what this layout assumes. Balancing and
 * structure keep the row-by-row path, where a line really is a step and
 * judging each one is right.
 */
export function hasWorksheet(topic, problemType) {
  return topic?.input === "numeric" && Boolean(problemType?.fields?.length);
}

function promptFor(field, row) {
  const unit = field.unit ?? unitFromLabel(field.label);
  const label = labelWithoutUnit(field.label, unit);
  return {
    key: field.name,
    label,
    unit,
    // What the empty box says. A topic supplies its own wherever the field
    // name alone leaves a question open: "write the amounts here" never
    // said which amounts, and "write the product here" never said which
    // product. The fallback is only for fields where the label is the whole
    // answer, like a formula.
    prompt: field.prompt ?? `write the ${label.toLowerCase()} here`,
    placeholder: field.placeholder ?? null,
    optional:
      field.optional === true || /optional/i.test(field.label ?? ""),
    // A select is a choice, not something anyone writes. It stays in the
    // panel and is skipped here rather than drawn as a box that cannot be
    // filled by writing in it.
    typed: field.type === "select",
    row,
  };
}

/**
 * The worksheet for one problem type.
 *
 * `workingRows` is passed in rather than stored, because it grows with the
 * ink and the caller is the only thing that knows where the ink is.
 */
export function buildWorksheet(
  topic,
  problemType,
  { workingRows = MIN_WORKING_ROWS } = {}
) {
  if (!hasWorksheet(topic, problemType)) return null;

  const prompts = problemType.fields
    .map((field, index) => promptFor(field, index))
    .filter((prompt) => !prompt.typed)
    .map((prompt, index) => ({ ...prompt, row: index }));

  const workingStart = prompts.length;
  const rows = Math.min(
    Math.max(Math.round(workingRows) || MIN_WORKING_ROWS, MIN_WORKING_ROWS),
    MAX_WORKING_ROWS
  );

  return {
    title: problemType.label,
    prompts,
    workingStart,
    workingRows: rows,
    answerRow: workingStart + rows,
    answerUnit: problemType.answerUnit ?? null,
  };
}

/** Which zone a row belongs to, or null for the empty page below the answer. */
export function zoneAtRow(worksheet, row) {
  if (!worksheet || row === null || row === undefined) return null;
  if (row < 0) return null;
  if (row < worksheet.workingStart) return ZONES.PROMPT;
  if (row < worksheet.answerRow) return ZONES.WORKING;
  if (row === worksheet.answerRow) return ZONES.ANSWER;
  return null;
}

/** The question field a row fills in, or null if the row is not a prompt. */
export function promptAtRow(worksheet, row) {
  if (zoneAtRow(worksheet, row) !== ZONES.PROMPT) return null;
  return worksheet.prompts.find((prompt) => prompt.row === row) ?? null;
}

/**
 * Should this row be sent for recognition?
 *
 * The working is the point of the exercise and it is deliberately not read.
 * That is not a shortcut: it is a call per hint quality, made because
 * everyone lays out arithmetic differently and a wrong verdict on a correct
 * scribble costs more than the extra context is worth.
 */
export function isReadableRow(worksheet, row) {
  const zone = zoneAtRow(worksheet, row);
  return zone === ZONES.PROMPT || zone === ZONES.ANSWER;
}

/**
 * How many working rows the box should have, given where the ink is.
 *
 * Grows to keep `HEADROOM_ROWS` clear under the last thing written, and
 * shrinks back when working is erased. Frozen once the answer box has
 * something in it, because moving a box a student has already written in is
 * worse than a box that is a little short.
 */
export function growWorkingRows(
  worksheet,
  { inkRows = [], answerFilled = false } = {}
) {
  if (!worksheet) return MIN_WORKING_ROWS;
  if (answerFilled) return worksheet.workingRows;

  const used = inkRows
    .filter((row) => zoneAtRow(worksheet, row) === ZONES.WORKING)
    .reduce((deepest, row) => Math.max(deepest, row), -1);
  if (used < 0) return MIN_WORKING_ROWS;

  return Math.min(
    Math.max(used - worksheet.workingStart + 1 + HEADROOM_ROWS, MIN_WORKING_ROWS),
    MAX_WORKING_ROWS
  );
}

/** Pixel bounds of one row band, for the overlay to draw against. */
export function rowBand(row, span = 1, lineHeight = DEFAULT_LINE_HEIGHT) {
  return { top: row * lineHeight, height: span * lineHeight };
}

/** Every required prompt has something in it, so the answer can be judged. */
export function promptsComplete(worksheet, values = {}) {
  if (!worksheet) return false;
  return worksheet.prompts
    .filter((prompt) => !prompt.optional)
    .every((prompt) => Boolean(String(values[prompt.key] ?? "").trim()));
}
