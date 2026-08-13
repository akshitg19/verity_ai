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
  // The middle of the page. What happens here depends on the kind below.
  WORKING: "working",
  // The one line that gets checked, on ANSWER worksheets only.
  ANSWER: "answer",
};

// Three shapes of page, because chemistry has three shapes of question and
// pretending otherwise is what made the numeric topics feel broken.
export const KINDS = {
  // Question boxes, working we do not read, one answer box with a unit.
  // Molar mass, pH, oxidation state, cell potential.
  ANSWER: "answer",
  // Question boxes, then working where **every row is a step and is judged
  // against the row above**. This is the original behaviour and it is the
  // one that works well today, so balancing, net ionic and half-reactions
  // keep it exactly. They gain the labelled question box and the growing
  // area, and nothing about their judging or their hints changes.
  STEPS: "steps",
  // Question boxes, then a space to draw in. The drawing is read as one
  // figure, so the prompt rows have to be kept out of the image.
  DRAW: "draw",
};

export function worksheetKindFor(inputMode) {
  if (inputMode === "drawing") return KINDS.DRAW;
  if (inputMode === "equation") return KINDS.STEPS;
  return KINDS.ANSWER;
}

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
  return Boolean(topic && problemType);
}

// A field the student can be asked to write. Everything else stays in the
// panel: a SMILES is ours and not theirs -- they do not know what it is and
// must never be asked to write one as the question -- and a fixed set of
// choices is a dropdown with nothing to write.
function isWritable(field) {
  return Boolean(field.ink) && field.type !== "select";
}

// A SMILES is the one thing a student must not be shown as the question.
// Everything else that lives in the panel is still printed on the page, so
// the page states the whole question rather than half of it.
const SECRET_FIELDS = /smiles/i;

// How many rows a rendered molecule gets. One row is a postage stamp.
const PICTURE_ROWS = 3;

// Things a student writes out as a whole line rather than as one value.
const WIDE_FIELDS =
  /equation|half-reaction|reaction|composition|amounts|name|reagent|cathode|anode/i;

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
    // What to say above a molecule we draw for them, which is an
    // instruction rather than a field name: "write the IUPAC name of this
    // molecule" beats "Structure to name".
    pictureLabel: field.pictureLabel ?? null,
    // A box for a whole written line runs the width of the page; a box for
    // one value does not need to. Judged by what goes in it rather than by
    // how long the caption is, so the box does not change size when the
    // wording is edited.
    wide: WIDE_FIELDS.test(`${field.name} ${field.ink ?? ""}`),
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
  { workingRows = MIN_WORKING_ROWS, inputMode } = {}
) {
  if (!hasWorksheet(topic, problemType)) return null;

  const mode = inputMode ?? problemType.input ?? topic.input ?? "drawing";
  const kind = worksheetKindFor(mode);

  // Every field appears on the page. The ones a student writes are boxes;
  // the ones set in the panel are printed as a line saying what they are and
  // where to change them, so the page states the whole question rather than
  // half of it and the student is never left wondering what they are drawing.
  let row = 0;
  const prompts = (problemType.fields ?? []).map((field) => {
    const secret = SECRET_FIELDS.test(field.name);
    const prompt = {
      ...promptFor(field, row),
      source: isWritable(field) ? "ink" : "panel",
      // A SMILES is never shown. The molecule it names is drawn instead, as
      // a picture, which is the only honest way to ask "name this structure"
      // or "draw an isomer of this" of somebody who has never heard of
      // SMILES. It needs real height to be readable.
      secret,
      rows: secret ? PICTURE_ROWS : 1,
      options: field.options ?? null,
    };
    row += prompt.rows;
    return prompt;
  });

  const workingStart = row;
  const rows = Math.min(
    Math.max(Math.round(workingRows) || MIN_WORKING_ROWS, MIN_WORKING_ROWS),
    MAX_WORKING_ROWS
  );

  return {
    kind,
    title: problemType.label,
    prompts,
    workingStart,
    workingRows: rows,
    // Only an ANSWER page has an answer box. On a STEPS page the last line
    // of the working is the answer, and on a DRAW page the answer is the
    // picture.
    answerRow: kind === KINDS.ANSWER ? workingStart + rows : null,
    answerUnit: kind === KINDS.ANSWER ? problemType.answerUnit ?? null : null,
    workingLabel:
      kind === KINDS.DRAW
        ? "Draw it below"
        : kind === KINDS.STEPS
        ? "Your working, one line at a time"
        : "Your working, laid out however you like",
  };
}

/** Which zone a row belongs to, or null for the empty page below it all. */
export function zoneAtRow(worksheet, row) {
  if (!worksheet || row === null || row === undefined) return null;
  if (row < 0) return null;
  if (row < worksheet.workingStart) return ZONES.PROMPT;
  // A page with no answer box has no floor: the working runs on, because a
  // student balancing an equation may take more lines than we guessed and
  // must never hit a wall.
  if (worksheet.answerRow === null) return ZONES.WORKING;
  if (row < worksheet.answerRow) return ZONES.WORKING;
  if (row === worksheet.answerRow) return ZONES.ANSWER;
  return null;
}

/** The question box a row fills in, or null if the row is not a written box. */
export function promptAtRow(worksheet, row) {
  if (!worksheet || row === null || row === undefined) return null;
  if (row < 0 || row >= worksheet.workingStart) return null;
  const prompt =
    worksheet.prompts.find(
      (entry) => row >= entry.row && row < entry.row + entry.rows
    ) ?? null;
  return prompt?.source === "ink" ? prompt : null;
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
  // A panel row is printed information, not a box. Nothing written on it is
  // sent anywhere, so reading it would be a call with nowhere to put it.
  if (zone === ZONES.PROMPT) return Boolean(promptAtRow(worksheet, row));
  if (zone === ZONES.ANSWER) return true;
  // On a STEPS page every working row IS a step and must be read, which is
  // the behaviour balancing and net ionic already have and that this change
  // must not disturb. On a DRAW page the middle is one figure, read whole
  // rather than row by row.
  return zone === ZONES.WORKING && worksheet?.kind === KINDS.STEPS;
}

/** Rows a drawing is made of: everything below the question boxes. */
export function isDrawingRow(worksheet, row) {
  if (worksheet?.kind !== KINDS.DRAW) return false;
  return zoneAtRow(worksheet, row) === ZONES.WORKING;
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
  if (worksheet.answerRow !== null && answerFilled) return worksheet.workingRows;

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
    .filter((prompt) => prompt.source === "ink" && !prompt.optional)
    .every((prompt) => Boolean(String(values[prompt.key] ?? "").trim()));
}
