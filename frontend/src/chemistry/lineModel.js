export function orderedChemistryLines(lines) {
  return [...(lines ?? [])].sort((left, right) => left.row - right.row);
}

export function readableChemistryLines(lines) {
  const readable = [];
  for (const line of orderedChemistryLines(lines)) {
    if (!line.text.trim() || line.unreadable) break;
    readable.push(line);
  }
  return readable;
}

export function buildChemistrySteps(lines) {
  return readableChemistryLines(lines).map((line, index) => ({
    line_number: index + 1,
    smiles: line.text.trim(),
  }));
}

// The working, which is every readable row that is not part of the question.
//
// `questionRows` takes a single row or several. A one-field type like molar
// mass consumes one written row; percent yield consumes four, because the
// equation, the amounts, the product and the actual yield are each written on
// their own line. All of them are the question and none of them are working.
export function chemistryStepLines(lines, questionRows = null) {
  const excluded =
    questionRows instanceof Set
      ? questionRows
      : new Set(
          (Array.isArray(questionRows) ? questionRows : [questionRows]).filter(
            (row) => row !== null && row !== undefined
          )
        );
  return readableChemistryLines(
    orderedChemistryLines(lines).filter((line) => !excluded.has(line.row))
  );
}

export function upsertChemistryLine(lines, nextLine) {
  return orderedChemistryLines([
    ...(lines ?? []).filter((line) => line.row !== nextLine.row),
    nextLine,
  ]);
}

export function removeChemistryLine(lines, row) {
  return orderedChemistryLines((lines ?? []).filter((line) => line.row !== row));
}

export function keepVerdictsBeforeRow(verdicts, row) {
  return new Map(
    [...(verdicts ?? new Map())].filter(([verdictRow]) => verdictRow < row)
  );
}

export function mapChemistryVerdicts(verdicts, lines) {
  const readableLines = readableChemistryLines(lines);
  return new Map(
    (verdicts ?? [])
      .filter((verdict) => verdict.line_number > 0)
      .map((verdict) => [readableLines[verdict.line_number - 1]?.row, verdict])
      .filter(([row]) => row !== undefined)
  );
}

export function rowForChemistryLineNumber(lines, lineNumber) {
  return readableChemistryLines(lines)[lineNumber - 1]?.row ?? null;
}

export function isStaleLineResponse(
  requestId,
  currentRequestId,
  version,
  currentVersion
) {
  return requestId !== currentRequestId || version !== currentVersion;
}

export function isWholePageChemistryInput(inputMode) {
  return inputMode === "drawing";
}
