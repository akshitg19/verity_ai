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

export function chemistryStepLines(lines, questionRow = null) {
  return readableChemistryLines(
    orderedChemistryLines(lines).filter((line) => line.row !== questionRow)
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
