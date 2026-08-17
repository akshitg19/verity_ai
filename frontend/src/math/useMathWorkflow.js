import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { checkSteps, getHint } from "../api";
import { buildMathCheckInput } from "./lineModel";
import useMathSession from "./useMathSession";
import { MATH_TOPIC_BY_ID } from "./topics";
import { defaultMathRecognizer } from "../recognition/recognitionConfig";
import RecognitionCoordinator from "../recognition/RecognitionCoordinator";
import { finalizationPolicyForRecognizer } from "../recognition/finalizationPolicy";
import {
  createRecognitionLifecycleTrace,
  emitRecognitionMetric,
} from "../recognition/recognitionMetrics";
import { resolveHandwritingExperienceExperiment } from
  "../recognition/handwritingExperienceExperiment";
import {
  deserializeWorkflowSnapshot,
  serializeWorkflowSnapshot,
  workflowProblemFingerprint,
} from "../notebook/workflowSnapshot";

function waitForNextPaint() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export default function useMathWorkflow({
  pageId = null,
  recognizer = defaultMathRecognizer,
  maxRecognitionConcurrency,
  emitRecognitionLifecycleMetric = emitRecognitionMetric,
} = {}) {
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
  const [provisionalByLine, setProvisionalByLine] = useState(new Map());

  const recognitionCoordinatorRef = useRef(null);
  const rowVersionsRef = useRef(new Map());
  const dirtyRowsRef = useRef(new Set());
  const checkRequestId = useRef(0);
  const hintRequestId = useRef(0);
  const checkAbortRef = useRef(null);
  const hintAbortRef = useRef(null);
  const pageScopeRef = useRef(pageId);
  const experienceExperiment = useMemo(
    () => resolveHandwritingExperienceExperiment(),
    []
  );
  const recognitionConcurrency = maxRecognitionConcurrency ??
    experienceExperiment.maxRecognitionConcurrency;
  const activeRecognizer = useMemo(
    () => recognizer.forTopic?.(topicId) ?? recognizer,
    [recognizer, topicId]
  );
  const recognitionPolicy = useMemo(
    () => {
      const policy = finalizationPolicyForRecognizer(activeRecognizer);
      if (!experienceExperiment.enabled || policy.inputMode !== "image") {
        return policy;
      }
      return Object.freeze({
        ...policy,
        quietPeriodMs: experienceExperiment.quietPeriodMs,
      });
    },
    [activeRecognizer, experienceExperiment]
  );
  const [recognitionStatus, setRecognitionStatus] = useState(() => ({
    state: "idle",
    source: activeRecognizer.source ?? "recognizer",
    inputMode: recognitionPolicy.inputMode,
    latencyMs: null,
  }));

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
      recognitionCoordinatorRef.current?.clear();
      setProvisionalByLine(new Map());

      setTopicId(nextTopicId);
      const nextRecognizer = recognizer.forTopic?.(nextTopicId) ?? recognizer;
      setRecognitionStatus({
        state: "idle",
        source: nextRecognizer.source ?? "recognizer",
        inputMode: finalizationPolicyForRecognizer(nextRecognizer).inputMode,
        latencyMs: null,
      });
      setVerdictsByLine(new Map());
      setFirstWrongLine(null);
      setLastResult(null);
    },
    [cancelSession, clearHints, recognizer, topicId]
  );

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
        const data = await checkSteps(topicId, effectiveProblem, stepList, {
          signal: abortController.signal,
        });
        if (requestId !== checkRequestId.current || requestPageId !== pageScopeRef.current) return;

        const problemVerdict = data.verdicts.find((verdict) => verdict.line_number === 0);
        const problemError = data.problem_error ?? problemVerdict?.error_type;
        if (problemError) {
          setLastResult({
            warning:
              problemError === "unsupported"
                ? "This problem is outside the current supported scope for this topic."
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
    [clearHints, topicId]
  );

  const isRecognitionJobCurrent = useCallback((job) => (
    job.pageId === pageScopeRef.current &&
    rowVersionsRef.current.get(job.row) === job.version
  ), []);

  const recognizeJob = useCallback(async (job, { signal, onProvisional }) => {
    job.trace.mark("recognition_start");
    try {
      return await activeRecognizer.recognize({
        strokes: [...job.strokes],
        expressionId: job.row,
        expressionVersion: job.version,
        pageId: job.pageId,
        topic: topicId,
        previousText: linesRef.current.find((line) => line.row === job.row)?.text,
        signal,
        onProvisional,
      });
    } finally {
      job.trace.mark("recognition_finished");
      if (job.provisional) job.trace.finish({
        outcome: signal.aborted ? "cancelled" : "provisional",
      });
      if (signal.aborted && !job.provisional) {
        job.trace.finish({ outcome: "cancelled" });
      }
    }
  }, [activeRecognizer, topicId]);

  const handleProvisionalResult = useCallback((job, result) => {
    if (!isRecognitionJobCurrent(job)) return;
    setProvisionalByLine((current) => {
      const next = new Map(current);
      next.set(job.row, {
        row: job.row,
        version: job.version,
        text: result.unreadable ? "" : result.text,
        unreadable: result.unreadable,
        source: result.source,
      });
      return next;
    });
  }, [isRecognitionJobCurrent]);

  const commitRecognizedRows = useCallback(async (entries) => {
    const current = entries.filter(({ job }) => isRecognitionJobCurrent(job));
    if (current.length === 0) return;
    const latest = current[current.length - 1];
    setRecognitionStatus({
      state: latest.result.unreadable ? "failure" : "success",
      source: latest.result.source ?? activeRecognizer.source ?? "recognizer",
      inputMode: recognitionPolicy.inputMode,
      latencyMs: Number.isFinite(latest.result.latencyMs)
        ? Math.round(latest.result.latencyMs)
        : null,
    });
    const committedRows = new Set(current.map(({ job }) => job.row));
    const nextLines = [
      ...linesRef.current.filter((line) => !committedRows.has(line.row)),
      ...current.map(({ job, result }) => ({
        row: job.row,
        text: result.unreadable ? "" : result.text ?? "",
        unreadable: Boolean(result.unreadable),
        version: job.version,
      })),
    ].sort((left, right) => left.row - right.row);
    linesRef.current = nextLines;
    setLines(nextLines);
    setProvisionalByLine((provisional) => new Map(
      [...provisional].filter(([row]) => !committedRows.has(row))
    ));
    for (const { job } of current) {
      dirtyRowsRef.current.delete(job.row);
      job.onProcessed?.();
      job.trace.mark("judge_start");
    }

    const changedRow = Math.min(...current.map(({ job }) => job.row));
    await recheck(nextLines, problemRef.current, changedRow);
    for (const { job } of current) job.trace.mark("judge_end");
    await waitForNextPaint();
    for (const { job, result } of current) {
      job.trace.mark("result_painted");
      job.trace.finish({
        provider: result.source,
        fallbackUsed: result.fallbackUsed,
        fallbackReason: result.fallbackReason,
        outcome: isRecognitionJobCurrent(job) ? "committed" : "stale",
      });
    }
  }, [activeRecognizer.source, isRecognitionJobCurrent, recognitionPolicy.inputMode, recheck]);

  const handleRecognitionError = useCallback((job, error) => {
    job.trace.finish({ outcome: "error" });
    if (!isRecognitionJobCurrent(job)) return;
    setProvisionalByLine((current) => new Map(
      [...current].filter(([row]) => row !== job.row)
    ));
    setRecognitionStatus({
      state: "failure",
      source: error.source ?? activeRecognizer.source ?? "recognizer",
      inputMode: recognitionPolicy.inputMode,
      latencyMs: null,
      code: error.code ?? "recognition_error",
    });
    setLastResult({ error: error.message });
  }, [activeRecognizer.source, isRecognitionJobCurrent, recognitionPolicy.inputMode]);

  useEffect(() => {
    const coordinator = new RecognitionCoordinator({
      recognize: recognizeJob,
      isCurrent: isRecognitionJobCurrent,
      onProvisional: handleProvisionalResult,
      onCommit: commitRecognizedRows,
      onError: handleRecognitionError,
      onActivityChange: setTranscribing,
      maxConcurrent: recognitionConcurrency,
    });
    recognitionCoordinatorRef.current = coordinator;
    return () => {
      coordinator.dispose();
      if (recognitionCoordinatorRef.current === coordinator) {
        recognitionCoordinatorRef.current = null;
      }
    };
  }, [
    commitRecognizedRows,
    handleProvisionalResult,
    handleRecognitionError,
    isRecognitionJobCurrent,
    recognitionConcurrency,
    recognizeJob,
  ]);

  const queueRow = useCallback(({
    row,
    strokes,
    onProcessed,
    pageId: rowPageId,
    provisional = false,
    timing = {},
  }) => {
    if (row === null || row === undefined || !strokes?.length) return;
    if (rowPageId !== pageScopeRef.current) return;
    const alreadyTranscribed = linesRef.current.some((line) => line.row === row);
    if (!provisional && alreadyTranscribed && !dirtyRowsRef.current.has(row)) return;

    const version = rowVersionsRef.current.get(row) ?? 0;
    const queuedAt = globalThis.performance?.now?.() ?? Date.now();
    const reportedPointerUpAt = Number.isFinite(timing.pointerUpAt)
      ? timing.pointerUpAt
      : queuedAt;
    const pointerUpAt = Math.abs(reportedPointerUpAt - queuedAt) < 60_000
      ? reportedPointerUpAt
      : queuedAt;
    const trace = createRecognitionLifecycleTrace({
      provider: activeRecognizer.source ?? "recognizer",
      mode: recognitionPolicy.inputMode,
      expressionVersion: version,
    }, {
      startedAt: pointerUpAt,
      emit: emitRecognitionLifecycleMetric,
    });
    trace.markAt("pointer_up", pointerUpAt);
    trace.markAt(
      "expression_ready",
      Number.isFinite(timing.expressionReadyAt)
        ? timing.expressionReadyAt
        : queuedAt
    );
    trace.markAt("recognition_queued", queuedAt);
    const enqueued = recognitionCoordinatorRef.current?.enqueue({
      row,
      strokes: [...strokes],
      version,
      onProcessed,
      pageId: rowPageId,
      provisional,
      trace,
    });
    if (!enqueued) {
      trace.finish({ outcome: "ignored" });
      return;
    }
    setRecognitionStatus({
      state: "reading",
      source: activeRecognizer.source ?? "recognizer",
      inputMode: recognitionPolicy.inputMode,
      latencyMs: null,
    });
    setLastResult(null);
  }, [activeRecognizer.source, emitRecognitionLifecycleMetric, recognitionPolicy.inputMode]);

  const invalidateRow = useCallback(
    (row) => {
      dirtyRowsRef.current.add(row);
      bumpRowVersion(row);
      recognitionCoordinatorRef.current?.invalidate(row);
      ++checkRequestId.current;
      checkAbortRef.current?.abort();
      checkAbortRef.current = null;

      const nextLines = linesRef.current.filter((line) => line.row !== row);
      linesRef.current = nextLines;
      setLines(nextLines);
      setProvisionalByLine((current) => new Map(
        [...current].filter(([provisionalRow]) => provisionalRow !== row)
      ));
      setVerdictsByLine((current) =>
        new Map([...current].filter(([verdictRow]) => verdictRow < row))
      );
      setFirstWrongLine(null);
      clearHints();
      setLastResult(null);
      setRecognitionStatus({
        state: "idle",
        source: activeRecognizer.source ?? "recognizer",
        inputMode: recognitionPolicy.inputMode,
        latencyMs: null,
      });
    },
    [activeRecognizer.source, bumpRowVersion, clearHints, recognitionPolicy.inputMode]
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

    ++checkRequestId.current;
    ++hintRequestId.current;
    recognitionCoordinatorRef.current?.clear();
    checkAbortRef.current?.abort();
    checkAbortRef.current = null;
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    rowVersionsRef.current.clear();
    dirtyRowsRef.current.clear();
    linesRef.current = [];
    setLines([]);
    setProvisionalByLine(new Map());
    setProblem("");
    problemRef.current = "";
    setVerdictsByLine(new Map());
    setFirstWrongLine(null);
    clearHints();
    setHintError(null);
    setLastResult(null);
    setTranscribing(false);
    setRecognitionStatus({
      state: "idle",
      source: activeRecognizer.source ?? "recognizer",
      inputMode: recognitionPolicy.inputMode,
      latencyMs: null,
    });
  }, [activeRecognizer.source, cancelSession, clearHints, recognitionPolicy.inputMode]);

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
    provisionalByLine,
    recognitionPolicy,
    recognitionStatus,
    experienceExperiment,
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
