import { useCallback, useEffect, useRef, useState } from "react";

import { checkSteps, getHint, transcribeLine } from "../api";
import { renderLineToPng } from "../canvas/render";
import { buildMathCheckInput } from "./lineModel";
import useMathSession from "./useMathSession";
import { MATH_TOPIC_BY_ID } from "./topics";
import {
  deserializeWorkflowSnapshot,
  serializeWorkflowSnapshot,
  workflowProblemFingerprint,
} from "../notebook/workflowSnapshot";

export default function useMathWorkflow({ pageId = null } = {}) {
  const [topicId, setTopicId] = useState("algebra");
  const [problem, setProblem] = useState("");
  const problemRef = useRef("");
  const [lines, setLines] = useState([]);
  const linesRef = useRef([]);
  const [verdictsByLine, setVerdictsByLine] = useState(new Map());
  const [firstWrongLine, setFirstWrongLine] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState(null);
  const [hintData, setHintData] = useState(null);
  const [hintError, setHintError] = useState(null);
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
  const checkAbortRef = useRef(null);
  const hintAbortRef = useRef(null);
  const pageScopeRef = useRef(pageId);

  const handleSessionFailure = useCallback((error) => {
    setHintError(error.message);
  }, []);

  const {
    session,
    ensureSession,
    cancelSession,
  } = useMathSession({
    topic: topicId,
    problemText: problem,
    pageScopeRef,
    onFailure: handleSessionFailure,
  });

  const bumpRowVersion = useCallback((row) => {
    const nextVersion = (rowVersionsRef.current.get(row) ?? 0) + 1;
    rowVersionsRef.current.set(row, nextVersion);
    return nextVersion;
  }, []);

  const clearHints = useCallback(() => {
    ++hintRequestId.current;
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    setHintLevel(0);
    setHintText(null);
    setHintData(null);
    setHintError(null);
    setHintLoading(false);
  }, []);

  const cancelHint = useCallback(() => {
    ++hintRequestId.current;
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    setHintLoading(false);
  }, []);

  const handleTopicChange = useCallback(
    (nextTopicId) => {
      const nextTopic = MATH_TOPIC_BY_ID[nextTopicId];

      if (!nextTopic?.implemented || nextTopicId === topicId) {
        return;
      }

      cancelSession();
      clearHints();

      ++checkRequestId.current;
      checkAbortRef.current?.abort();
      checkAbortRef.current = null;

      setTopicId(nextTopicId);
      setVerdictsByLine(new Map());
      setFirstWrongLine(null);
      setLastResult(null);
    },
    [cancelSession, clearHints, topicId]
  );

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
      checkAbortRef.current?.abort();
      const abortController = new AbortController();
      checkAbortRef.current = abortController;
      const requestPageId = pageScopeRef.current;
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

      const { effectiveProblem, stepList, rowByLineNumber } =
        buildMathCheckInput(lineArr, problemText);

      if (!effectiveProblem || stepList.length === 0) {
        checkAbortRef.current = null;
        return;
      }

      try {
        const data = await checkSteps(effectiveProblem, stepList, {
          signal: abortController.signal,
        });
        if (requestId !== checkRequestId.current || requestPageId !== pageScopeRef.current) return;

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
        if (requestId !== checkRequestId.current || requestPageId !== pageScopeRef.current) return;
        if (error.name === "AbortError") return;
        setVerdictsByLine(new Map());
        setFirstWrongLine(null);
        clearHints();
        setLastResult({ error: `Check failed: ${error.message}` });
      } finally {
        if (checkAbortRef.current === abortController) checkAbortRef.current = null;
      }
    },
    [clearHints]
  );

  const processRow = useCallback(
    async ({ row, strokes, version, onProcessed, pageId: rowPageId }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (
        !strokes?.length ||
        rowPageId !== undefined && rowPageId !== pageScopeRef.current ||
        rowVersionsRef.current.get(row) !== version
      ) return;

      const requestId = ++transcriptionRequestId.current;
      transcriptionRowRef.current = row;
      try {
        const dataUrl = await renderLineToPng([...strokes]);
        if (
          requestId !== transcriptionRequestId.current ||
          rowPageId !== undefined && rowPageId !== pageScopeRef.current ||
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
          rowPageId !== undefined && rowPageId !== pageScopeRef.current ||
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
        onProcessed?.();
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
    ({ row, strokes, onProcessed }) => {
      if (row === null || row === undefined || !strokes?.length) return;
      if (pageId !== undefined && pageId !== pageScopeRef.current) return;
      const alreadyTranscribed = linesRef.current.some((line) => line.row === row);
      if (alreadyTranscribed && !dirtyRowsRef.current.has(row)) return;

      rowQueueRef.current = rowQueueRef.current.filter((entry) => entry.row !== row);
      rowQueueRef.current.push({
        row,
        strokes: [...strokes],
        version: rowVersionsRef.current.get(row) ?? 0,
        onProcessed,
        pageId,
      });
      setTranscribing(true);
      void runRowQueue();
    },
    [pageId, runRowQueue]
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

    cancelSession();

    ++checkRequestId.current;
    ++hintRequestId.current;
    setVerdictsByLine(new Map());
    setFirstWrongLine(null);
    clearHints();
    setLastResult(null);
  }, [cancelSession, clearHints]);

  const handleProblemEditDone = useCallback(
    () => recheck(linesRef.current, problemRef.current),
    [recheck]
  );

  const handleGetHint = useCallback(async () => {
    if (firstWrongLine === null || hintLevel >= 3) return;

    const {
      effectiveProblem,
      stepList,
      rowByLineNumber,
    } = buildMathCheckInput(linesRef.current, problemRef.current);

    if (!effectiveProblem || stepList.length === 0) {
      return;
    }

    const wrongRow = rowByLineNumber.get(firstWrongLine);
    if (wrongRow === undefined) {
      return;
    }

    const activeVerdict = verdictsByLine.get(wrongRow);

    if (
      !activeVerdict ||
      (activeVerdict.status ??
        (activeVerdict.valid ? "valid" : "invalid")) !== "invalid"
    ) {
      return;
    }

    const activeLine = linesRef.current.find(
      (line) => line.row === wrongRow
    );

    const previousRow = rowByLineNumber.get(firstWrongLine - 1);
    const previousLine =
      previousRow === undefined
        ? null
        : linesRef.current.find((line) => line.row === previousRow);

    const nextLevel = hintLevel + 1;
    const requestId = ++hintRequestId.current;

    hintAbortRef.current?.abort();

    const abortController = new AbortController();
    hintAbortRef.current = abortController;

    const requestPageId = pageScopeRef.current;

    setHintLoading(true);
    setHintError(null);

    try {
      const activeSession = await ensureSession(effectiveProblem);

      if (
        requestId !== hintRequestId.current ||
        requestPageId !== pageScopeRef.current
      ) {
        return;
      }

      const data = await getHint(
        {
          line_number: firstWrongLine,
          error_type: activeVerdict.error_type ?? null,
          level: nextLevel,
          subject: "math",
          topic: topicId,
          session_id: activeSession?.session_id ?? null,
          problem: effectiveProblem,
          student_line: activeLine?.text ?? null,
          previous_line: previousLine?.text ?? null,
        },
        {
          signal: abortController.signal,
        }
      );

      if (
        requestId !== hintRequestId.current ||
        requestPageId !== pageScopeRef.current
      ) {
        return;
      }

      setHintError(null);
      setHintLevel(data.level);
      setHintText(data.hint);
      setHintData(data);
    } catch (error) {
      if (
        requestId !== hintRequestId.current ||
        requestPageId !== pageScopeRef.current
      ) {
        return;
      }

      if (error.name === "AbortError") return;

      setHintError(error.message);
    } finally {
      if (requestId === hintRequestId.current) {
        setHintLoading(false);
      }

      if (hintAbortRef.current === abortController) {
        hintAbortRef.current = null;
      }
    }
  }, [
    ensureSession,
    firstWrongLine,
    hintLevel,
    topicId,
    verdictsByLine,
  ]);

  const clear = useCallback(() => {
    cancelSession();

    ++transcriptionRequestId.current;
    ++checkRequestId.current;
    ++hintRequestId.current;
    checkAbortRef.current?.abort();
    checkAbortRef.current = null;
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
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
    setHintError(null);
    setLastResult(null);
    setTranscribing(false);
  }, [cancelSession, clearHints]);

  const getWorkflowSnapshot = useCallback(() => {
    return serializeWorkflowSnapshot({
      subject: "math",
      mode: "math",
      problemText: problemRef.current,
      problemFingerprint: workflowProblemFingerprint({
        subject: "math",
        problemText: problemRef.current,
      }),
      recognizedLines: linesRef.current,
      verdictsByLine,
      firstWrongLine,
      hintLevel,
      hintText,
      lastResult,
      updatedAt: Date.now(),
    });
  }, [firstWrongLine, hintLevel, hintText, lastResult, verdictsByLine]);

  const restoreWorkflowSnapshot = useCallback((rawSnapshot) => {
    const snapshot = deserializeWorkflowSnapshot(rawSnapshot);
    if (!snapshot || snapshot.subject !== "math") {
      clear();
      return;
    }
    clear();
    const nextLines = [...(snapshot.recognizedLines ?? [])];
    problemRef.current = snapshot.problemText ?? "";
    linesRef.current = nextLines;
    rowVersionsRef.current.clear();
    for (const line of nextLines) rowVersionsRef.current.set(line.row, line.version ?? 0);
    setProblem(problemRef.current);
    setLines(nextLines);
    setVerdictsByLine(snapshot.verdictsByLine ?? new Map());
    setFirstWrongLine(snapshot.firstWrongLine ?? null);
    setHintLevel(snapshot.hintLevel ?? 0);
    setHintText(snapshot.hintText ?? null);
    setHintData(
      snapshot.hintText
        ? {
            level: snapshot.hintLevel ?? 0,
            hint: snapshot.hintText,
            source: "fallback",
          }
        : null
    );
    setHintError(null);
    setLastResult(snapshot.lastResult ?? null);
  }, [clear]);

  useEffect(() => {
    pageScopeRef.current = pageId;
    // A page identity change is an intentional state reset; the following
    // render restores the destination snapshot atomically from App.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    clear();
  }, [clear, pageId]);

  useEffect(() => () => {
    checkAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    transcriptionAbortRef.current?.abort();
  }, []);

  return {
    topicId,
    topic: MATH_TOPIC_BY_ID[topicId],
    handleTopicChange,
    problem,
    lines,
    verdictsByLine,
    firstWrongLine,
    hintLevel,
    hintText,
    hintData,
    hintError,
    hintLoading,
    transcribing,
    lastResult,
    session,
    queueRow,
    invalidateRow,
    handleLineEdit,
    handleLineEditDone,
    handleProblemChange,
    handleProblemEditDone,
    handleFinishLine: null,
    handleGetHint,
    cancelHint,
    clear,
    getWorkflowSnapshot,
    restoreWorkflowSnapshot,
  };
}
