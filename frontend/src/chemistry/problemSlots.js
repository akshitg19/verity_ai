import { DEFAULT_LINE_HEIGHT } from "../canvas/geometry";

// The problem, filled in on the page instead of typed into a panel.
//
// The popover that offers "use this as the equation" works for exactly one
// kind of thing: a line a student would naturally write out whole, like
// `2Al + 3CuSO4 -> Al2(SO4)3 + 3Cu`. It does not work for the rest of a
// problem, and trying to make it work was the wrong idea. Nobody writes
// `Al: 25.0` on a line by itself, a student reading a question out of a
// textbook writes nothing at all before starting, and there is no way to
// reach back and re-label a row you already wrote.
//
// So the parameters get slots: labelled boxes laid out down the top of the
// page, written into with the stylus, with the unit printed outside so only
// the number goes in the box. Below the last slot the page turns into
// working, and every line from there down is judged.
//
// This module is the geometry and nothing else. It decides which rows are
// slots, which field each row feeds, where the working starts, and which
// column a stroke landed in. No React, no canvas, no fetch, so all of it is
// testable without a DOM.

export const SLOT_KINDS = {
  // One box, one value. The unit sits outside it.
  VALUE: "value",
  // A line the student writes out whole: an equation, a formula, a name.
  // These keep the popover as well, because writing them is natural.
  LINE: "line",
  // A two-column table that grows: species on the left, amount on the right.
  // `N2 | 28.0`, one pair per row, because that is how anyone writes a list
  // of amounts.
  PAIRS: "pairs",
};

// Where a pairs row splits. Left of this is the species, right is the amount.
export const PAIR_SPLIT_RATIO = 0.45;

const DEFAULT_PAIR_ROWS = 2;
const MAX_PAIR_ROWS = 8;

// A unit written into a field label, e.g. "Mass (g)" -> "g". Declared units
// win; this only saves repeating what the label already says.
function unitFromLabel(label = "") {
  const match = label.match(/\(([^)]+)\)\s*$/);
  if (!match) return null;
  const inner = match[1].trim();
  // "(optional)" and "(SMILES)" are notes to the student, not units.
  if (/optional|smiles|leave blank/i.test(inner)) return null;
  return inner;
}

// The label with any unit stripped off, since the unit is rendered separately.
function labelWithoutUnit(label = "", unit) {
  if (!unit) return label;
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label;
}

export function slotKindFor(field) {
  if (field.slot) return field.slot;
  if (field.type === "select") return SLOT_KINDS.VALUE;
  if (/^(amounts|composition)$/.test(field.name)) return SLOT_KINDS.PAIRS;
  // A field the popover already fills from a written line stays a line.
  if (field.ink && /equation|formula|name|species|half-reaction/i.test(
    `${field.name} ${field.label} ${field.ink}`
  )) {
    return SLOT_KINDS.LINE;
  }
  return SLOT_KINDS.VALUE;
}

/**
 * The slots one problem type needs, in the order they appear down the page.
 *
 * `pairRows` lets a caller grow the amounts table; a student with three
 * reactants adds a row rather than being stuck with two.
 */
export function buildSlots(problemType, { pairRows = DEFAULT_PAIR_ROWS } = {}) {
  if (!problemType?.fields) return [];
  return problemType.fields.map((field) => {
    const kind = slotKindFor(field);
    const unit = field.unit ?? unitFromLabel(field.label);
    return {
      key: field.name,
      kind,
      label: labelWithoutUnit(field.label, unit),
      unit,
      placeholder: field.placeholder ?? null,
      options: field.options ?? null,
      optional: field.optional === true || /optional/i.test(field.label ?? ""),
      // A pairs slot is several rows; everything else is one.
      rows:
        kind === SLOT_KINDS.PAIRS
          ? Math.min(Math.max(1, pairRows), MAX_PAIR_ROWS)
          : 1,
    };
  });
}

/**
 * Place the slots on the page, one row each except a pairs table.
 *
 * Returns each slot with the row it starts at and how many it spans, plus
 * pixel bounds for drawing, so the overlay never recomputes this itself and
 * the two cannot disagree about where a box is.
 */
export function layoutSlots(slots, { lineHeight = DEFAULT_LINE_HEIGHT } = {}) {
  let row = 0;
  return slots.map((slot) => {
    const placed = {
      ...slot,
      row,
      rowSpan: slot.rows,
      top: row * lineHeight,
      height: slot.rows * lineHeight,
    };
    row += slot.rows;
    return placed;
  });
}

/** The first row that belongs to the student's working rather than the problem. */
export function workingStartRow(layout) {
  if (!layout?.length) return 0;
  const last = layout[layout.length - 1];
  return last.row + last.rowSpan;
}

/** Which slot a row feeds, or null if the row is working. */
export function slotAtRow(layout, row) {
  if (row === null || row === undefined) return null;
  return (
    layout.find(
      (slot) => row >= slot.row && row < slot.row + slot.rowSpan
    ) ?? null
  );
}

/** Is this row part of the student's working? */
export function isWorkingRow(layout, row) {
  return row !== null && row !== undefined && row >= workingStartRow(layout);
}

/**
 * Which column of a pairs row a stroke landed in.
 *
 * Split by where the ink actually is rather than by which half is nearer, so
 * a wide `CuSO4` starting at the left margin stays a species even when its
 * tail crosses the divider.
 */
export function pairColumnAt(x, width, ratio = PAIR_SPLIT_RATIO) {
  if (!width || width <= 0) return "species";
  return x < width * ratio ? "species" : "amount";
}

/**
 * Turn what was written in the slot rows into the values object the topic's
 * `buildPayload` already expects.
 *
 * `lines` is the transcription list: `{ row, text, column }`, where `column`
 * is set only for pairs rows. Pairs come back as `"N2: 28.0, H2: 6.0"`,
 * which is the string format `parsePairs` in topics.js already reads, so no
 * judge or payload builder changes.
 */
export function valuesFromSlots(layout, lines = []) {
  const values = {};
  const pairs = new Map(); // slot key -> row -> { species, amount }

  for (const line of lines) {
    const slot = slotAtRow(layout, line.row);
    if (!slot) continue;
    const text = (line.text ?? "").trim();
    if (!text) continue;

    if (slot.kind !== SLOT_KINDS.PAIRS) {
      values[slot.key] = text;
      continue;
    }

    if (!pairs.has(slot.key)) pairs.set(slot.key, new Map());
    const rows = pairs.get(slot.key);
    if (!rows.has(line.row)) rows.set(line.row, {});
    rows.get(line.row)[line.column === "amount" ? "amount" : "species"] = text;
  }

  for (const [key, rows] of pairs) {
    const written = [...rows.entries()]
      .sort(([a], [b]) => a - b)
      // A half-filled row is not an error, it is a student mid-way through.
      // It is dropped rather than sent as `N2: ` for a parser to choke on.
      .filter(([, pair]) => pair.species && pair.amount)
      .map(([, pair]) => `${pair.species}: ${pair.amount}`);
    if (written.length) values[key] = written.join(", ");
  }

  return values;
}

/** Every required slot has something in it, so the working can be judged. */
export function slotsComplete(layout, values) {
  return layout
    .filter((slot) => !slot.optional)
    .every((slot) => Boolean(String(values[slot.key] ?? "").trim()));
}
