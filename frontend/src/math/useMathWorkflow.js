import { useCallback, useRef, useState } from "react";

import { checkSteps, getHint, transcribeLine } from "../api";
import { renderLineToPng } from "../canvas/render";

function readableLines(lines) {
  return [...lines]
    .sort((left, right) => left.row - right.row)
    .filter((line) => line.text.trim() && !line.unreadable);
}

export default function useMathWorkflow() {
  const [problem, setProblem] = useState("");
  const problemRef = useRef("");
  const [lines, setLines] = useState([]);
  const linesRef = useRef([]);
  const [verdictsByLine, setVerdictsByLine] = useState(new Map());
  const [firstWrongLine, setFirstWrongLine] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const transcriptionRequestId = useRef(0);
  const transcriptionAbortRef = useRef(null);
  const transcriptionRowRef = useRef(null);
  const rowQueueRef = useRef([]);
  const queueRunningRef = useRef(false);
  const rowVersionsRef = useRef(new Map());
  const dirtyRowsRef = useRef(new Set());
  const checkRequestId = useRef(0);
  const hintRequestId = useRef(0);

  const bumpRowVersion = useCallback((row) => {
    const nextVersion = (rowVersionsRef.current.get(row) ?? 0) + 1;
    rowVersionsRef.current.set(row, nextVersion);
    return nextVersion;
  }, []);

  const clearHints = useCallback(() => {
    ++hintRequestId.current;
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
  }, []);

  const cancelTranscriptionForRow = useCallback((row) => {
    if (transcriptionRowRef.current !== row) return;
    ++transcriptionRequestId.current;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    transcriptionRowRef.current = null;
  }, []);

  const recheck = useCallback(
    async (lineArr, problemText = problemRef.current, changedRow = null) => {
      const requestId = ++checkRequestId.current;
      ++hintRequestId.current;
      clearHints();
      setVerdictsByLine((current) => {
        if (changedRow === null) return new Map();
        return new Map(
          [...current].filter(([row]) => row < changedRow)
        );
      });
      setFirstWrongLine(null);
      setLastResult(null);

      const orderedLines = [...lineArr].sort((left, right) => left.row - right.row);
      const readable = readableLines(orderedLines);
      const typedProblem = problemText.trim();
      const handwrittenProblem = typedProblem ? null : readable[0] ?? null;
      const effectiveProblem = typedProblem || handwrittenProblem?.text.trim() || "";
      const solutionLines = typedProblem ? readable : readable.slice(1);
      const judgeLines = solutionLines.map((line, index) => ({
        row: line.row,
        line_number: index + 1,
        latex: line.text,
      }));
      const stepList = judgeLines.map(({ line_number, latex }) => ({
        line_number,
        latex,
      }));
      const rowByLineNumber = new Map(
        judgeLines.map((line) => [line.line_number, line.row])
      );

      if (!effectiveProblem || stepList.length === 0) return;

      try {
        const data = await checkSteps(effectiveProblem, stepList);
        if (requestId !== checkRequestId.current) return;

        const problemVerdict = data.verdicts.find((verdict) => verdict.line_number === 0);
        const problemError = data.problem_error ?? problemVerdict?.error_type;
        if (problemError) {
          setLastResult({
            warning:
              problemError === "unsupported"
                ? "This problem is outside the current one-variable linear scope."
                : "The problem could not be parsed. Check the format and try again.",
          });
          return;
        }

        const returnedVerdicts = new Map(
          data.verdicts
            .filter((verdict) => verdict.line_number > 0)
            .map((verdict) => [rowByLineNumber.get(verdict.line_number), verdict])
            .filter(([row]) => row !== undefined)
        );
        setVerdictsByLine((current) => {
          if (changedRow === null) return returnedVerdicts;
          const merged = new Map(
            [...current].filter(([row]) => row < changedRow)
          );
          for (const [row, verdict] of returnedVerdicts) {
            if (row >= changedRow) merged.set(row, verdict);
          }
          return merged;
        });
        setFirstWrongLine(data.first_wrong_line > 0 ? data.first_wrong_line : null);
      } catch (error) {
        if (requestId !== checkRequestId.current) return;
        setVerdictsByLine(new Map());
        setFirstWrongLine(null);
        clearHints();
        setLastResult({ error: `Check failed: ${error.message}` });
      }
    },
    [clearHints]
  );

  const processRow = useCallback(
    async ({ row, strokes, version }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!strokes?.length || rowVersionsRef.current.get(row) !== version) return;

      const requestId = ++transcriptionRequestId.current;
      transcriptionRowRef.current = row;
      try {
        const dataUrl = await renderLineToPng([...strokes]);
        if (
          requestId !== transcriptionRequestId.current ||
          rowVersionsRef.current.get(row) !== version
        ) {
          return;
        }

        setLastResult(null);
        const abortController = new AbortController();
        transcriptionAbortRef.current = abortController;
        const data = await transcribeLine(dataUrl.split(",")[1], {
          signal: abortController.signal,
        });
        if (
          requestId !== transcriptionRequestId.current ||
          rowVersionsRef.current.get(row) !== version
        ) {
          return;
        }

        const nextLines = [
          ...linesRef.current.filter((line) => line.row !== row),
          {
            row,
            text: data.unreadable ? "" : data.text ?? "",
            unreadable: Boolean(data.unreadable),
          },
        ].sort((left, right) => left.row - right.row);
        linesRef.current = nextLines;
        setLines(nextLines);
        dirtyRowsRef.current.delete(row);
        await recheck(nextLines, problemRef.current, row);
      } catch (error) {
        if (requestId !== transcriptionRequestId.current) return;
        if (error.name === "AbortError") return;
        setLastResult({ error: error.message });
      } finally {
        if (transcriptionRowRef.current === row) {
          transcriptionRowRef.current = null;
          transcriptionAbortRef.current = null;
        }
      }
    },
    [recheck]
  );

  const runRowQueue = useCallback(async () => {
    if (queueRunningRef.current) return;
    queueRunningRef.current = true;
    try {
      while (rowQueueRef.current.length > 0) {
        await processRow(rowQueueRef.current.shift());
      }
    } finally {
      queueRunningRef.current = false;
      transcriptionRowRef.current = null;
      setTranscribing(false);
    }
  }, [processRow]);

  const queueRow = useCallback(
    ({ row, strokes }) => {
      if (row === null || row === undefined || !strokes?.length) return;
      const alreadyTranscribed = linesRef.current.some((line) => line.row === row);
      if (alreadyTranscribed && !dirtyRowsRef.current.has(row)) return;

      rowQueueRef.current = rowQueueRef.current.filter((entry) => entry.row !== row);
      rowQueueRef.current.push({
        row,
        strokes: [...strokes],
        version: rowVersionsRef.current.get(row) ?? 0,
      });
      setTranscribing(true);
      void runRowQueue();
    },
    [runRowQueue]
  );

  const invalidateRow = useCallback(
    (row) => {
      dirtyRowsRef.current.add(row);
      bumpRowVersion(row);
      rowQueueRef.current = rowQueueRef.current.filter((entry) => entry.row !== row);
      cancelTranscriptionForRow(row);

      const nextLines = linesRef.current.filter((line) => line.row !== row);
      linesRef.current = nextLines;
      setLines(nextLines);
      setVerdictsByLine((current) =>
        new Map([...current].filter(([verdictRow]) => verdictRow < row))
      );
      setFirstWrongLine(null);
      clearHints();
      setLastResult(null);
    },
    [bumpRowVersion, cancelTranscriptionForRow, clearHints]
  );

  const handleLineEdit = useCallback(
    (row, newText) => {
      invalidateRow(row);
      const nextLines = [
        ...linesRef.current,
        { row, text: newText, unreadable: false },
      ].sort((left, right) => left.row - right.row);
      linesRef.current = nextLines;
      setLines(nextLines);
    },
    [invalidateRow]
  );

  const handleLineEditDone = useCallback(
    (row) => recheck(linesRef.current, problemRef.current, row),
    [recheck]
  );

  const handleProblemChange = useCallback((event) => {
    const nextProblem = event.target.value;
    problemRef.current = nextProblem;
    setProblem(nextProblem);
    ++checkRequestId.current;
    ++hintRequestId.current;
    setVerdictsByLine(new Map());
    setFirstWrongLine(null);
    clearHints();
    setLastResult(null);
  }, [clearHints]);

  const handleProblemEditDone = useCallback(
    () => recheck(linesRef.current, problemRef.current),
    [recheck]
  );

  const handleGetHint = useCallback(async () => {
    if (firstWrongLine === null || hintLevel >= 3) return;
    const activeVerdict = [...verdictsByLine.values()].find(
      (item) => item.line_number === firstWrongLine
    );
    if (!activeVerdict || (activeVerdict.status ?? (activeVerdict.valid ? "valid" : "invalid")) !== "invalid") {
      return;
    }

    const nextLevel = hintLevel + 1;
    const requestId = ++hintRequestId.current;
    setHintLoading(true);
    try {
      const data = await getHint({
        line_number: firstWrongLine,
        error_type: activeVerdict.error_type ?? null,
        level: nextLevel,
      });
      if (requestId !== hintRequestId.current) return;
      setHintLevel(data.level);
      setHintText(data.hint);
    } catch (error) {
      if (requestId !== hintRequestId.current) return;
      setHintLevel(nextLevel);
      setHintText(`Error: ${error.message}`);
    } finally {
      if (requestId === hintRequestId.current) setHintLoading(false);
    }
  }, [firstWrongLine, hintLevel, verdictsByLine]);

  const clear = useCallback(() => {
    ++transcriptionRequestId.current;
    ++checkRequestId.current;
    ++hintRequestId.current;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    rowQueueRef.current = [];
    rowVersionsRef.current.clear();
    dirtyRowsRef.current.clear();
    linesRef.current = [];
    setLines([]);
    setProblem("");
    problemRef.current = "";
    setVerdictsByLine(new Map());
    setFirstWrongLine(null);
    clearHints();
    setLastResult(null);
    setTranscribing(false);
  }, [clearHints]);

  return {
    problem,
    lines,
    verdictsByLine,
    firstWrongLine,
    hintLevel,
    hintText,
    hintLoading,
    transcribing,
    lastResult,
    queueRow,
    invalidateRow,
    handleLineEdit,
    handleLineEditDone,
    handleProblemChange,
    handleProblemEditDone,
    handleFinishLine: null,
    handleGetHint,
    clear,
  };
}
