export function orderedMathLines(lines) {
  return [...(lines ?? [])].sort((left, right) => left.row - right.row);
}

export function readableMathLines(lines) {
  const readable = [];
  for (const line of orderedMathLines(lines)) {
    if (line.unreadable || !line.text.trim()) break;
    readable.push(line);
  }
  return readable;
}

export function buildMathCheckInput(lines, problemText) {
  const readableLines = readableMathLines(lines);
  const typedProblem = (problemText ?? "").trim();
  const handwrittenProblem = typedProblem ? null : readableLines[0] ?? null;
  const effectiveProblem = typedProblem || handwrittenProblem?.text.trim() || "";
  const solutionLines = typedProblem ? readableLines : readableLines.slice(1);
  const judgeLines = solutionLines.map((line, index) => ({
    row: line.row,
    line_number: index + 1,
    latex: line.text,
  }));

  return {
    effectiveProblem,
    handwrittenProblemRow: handwrittenProblem?.row ?? null,
    readableLines,
    stepList: judgeLines.map(({ line_number, latex }) => ({ line_number, latex })),
    rowByLineNumber: new Map(
      judgeLines.map(({ line_number, row }) => [line_number, row])
    ),
  };
}
