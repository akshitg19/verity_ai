import { useCallback, useEffect, useRef, useState } from "react";

import { renderLineToPng } from "../canvas/render";
import {
  captureSample,
  getHint,
  renderStructure,
  transcribeChemistryText,
} from "../api";
import {
  buildChemistrySteps,
  chemistryStepLines,
  isStaleLineResponse,
  isWholePageChemistryInput,
  keepVerdictsBeforeRow,
  mapChemistryVerdicts,
  orderedChemistryLines,
  removeChemistryLine,
  rowForChemistryLineNumber,
  upsertChemistryLine,
} from "./lineModel";
import { readStructureSnapshot } from "./requestModel";
import useChemistrySession from "./useChemistrySession";
import { trustedStructurePreview } from "./structurePreview";
import { emptyValues, readStoredTopic, rememberTopic } from "./topicMemory";
import {
  deserializeWorkflowSnapshot,
  serializeWorkflowSnapshot,
  workflowProblemFingerprint,
} from "../notebook/workflowSnapshot";
import {
  TOPICS,
  describeProblem,
  inputModeFor,
  isProblemReady,
  questionFieldFor,
} from "./topics";


function addReadingRow(current, row) {
  const next = new Set(current);
  next.add(row);
  return next;
}

function removeReadingRow(current, row) {
  const next = new Set(current);
  next.delete(row);
  return next;
}

export default function useChemistry({ pageId = null } = {}) {
  const [stored] = useState(readStoredTopic);
  const [topicId, setTopicId] = useState(stored.topicId);
  const topic = TOPICS.find((entry) => entry.id === topicId) ?? TOPICS[0];
  const [typeId, setTypeId] = useState(stored.typeId ?? topic.types[0].id);
  const problemType =
    topic.types.find((entry) => entry.id === typeId) ?? topic.types[0];
  const [values, setValues] = useState(
    () => stored.values ?? emptyValues(topic.types[0])
  );

  // Structures are one two-dimensional figure. Written chemistry uses one
  // entry per segmented row so each claim can be corrected and checked on its
  // own without pretending a page-wide transcription was one answer.
  const [answer, setAnswer] = useState("");
  const [lines, setLines] = useState([]);
  const linesRef = useRef([]);
  const [read, setRead] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const [confidence, setConfidence] = useState("high");
  const [preview, setPreview] = useState(null);
  const [pageReading, setPageReading] = useState(false);
  const [readingRows, setReadingRows] = useState(() => new Set());

  const [verdict, setVerdict] = useState(null);
  const [verdictsByLine, setVerdictsByLine] = useState(new Map());
  const [firstWrongRow, setFirstWrongRow] = useState(null);
  const [problemError, setProblemError] = useState(null);
  const [checking, setChecking] = useState(false);

  const [hintLevel, setHintLevel] = useState(0);
  const [hint, setHint] = useState(null);
  const [hintError, setHintError] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);

  const [status, setStatus] = useState(null); // { error } | { notice }
  const [captureNote, setCaptureNote] = useState("");
  const [captureCount, setCaptureCount] = useState(null);

  const requestId = useRef(0);
  const hintRequestId = useRef(0);
  const previewRequestId = useRef(0);
  const lineRequestIds = useRef(new Map());
  const lineVersions = useRef(new Map());
  const lineAbortControllers = useRef(new Map());
  const checkAbortRef = useRef(null);
  const hintAbortRef = useRef(null);
  const previewAbortRef = useRef(null);
  const pageScopeRef = useRef(pageId);

  // The row the student marked as the question, and the rows where they said
  // "this is my working" so the offer stops coming back.
  const [questionRow, setQuestionRow] = useState(null);
  const questionRowRef = useRef(null);
  const [dismissedRows, setDismissedRows] = useState(() => new Set());

  const inputMode = inputModeFor(topic, problemType);
  const isDrawing = isWholePageChemistryInput(inputMode);
  const ready = isProblemReady(problemType, values);
  const problemText = describeProblem(topic, problemType, values);
  const reading = pageReading || readingRows.size > 0;
  const handleSessionFailure = useCallback((error) => {
    setStatus({
      notice:
        "We couldn't solve this problem ahead of time, so hints will be the " +
        "built-in ones rather than written for your work.",
    });
    return error;
  }, []);

  const { session, ensureSession, cancelSession } = useChemistrySession({
    topic,
    problemType,
    values,
    problemText,
    pageScopeRef,
    onFailure: handleSessionFailure,
  });

  useEffect(() => {
    rememberTopic(topicId, typeId, values);
  }, [topicId, typeId, values]);

  // -- invalidation -------------------------------------------------------

  const clearHints = useCallback(() => {
    hintRequestId.current += 1;
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    setHintLevel(0);
    setHint(null);
    setHintError(null);
    setHintLoading(false);
  }, []);

  const clearVerdict = useCallback(() => {
    requestId.current += 1;
    checkAbortRef.current?.abort();
    checkAbortRef.current = null;
    setPageReading(false);
    setChecking(false);
    setVerdict(null);
    setVerdictsByLine(new Map());
    setFirstWrongRow(null);
    setProblemError(null);
    clearHints();
  }, [clearHints]);

  const invalidateRequests = useCallback(() => {
    requestId.current += 1;
    previewRequestId.current += 1;
    checkAbortRef.current?.abort();
    checkAbortRef.current = null;
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    setPageReading(false);
    setChecking(false);
    setReadingRows(new Set());
    clearHints();
  }, [clearHints]);

  const clearAnswer = useCallback(() => {
    requestId.current += 1;
    previewRequestId.current += 1;
    checkAbortRef.current?.abort();
    checkAbortRef.current = null;
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    for (const controller of lineAbortControllers.current.values()) controller.abort();
    lineAbortControllers.current.clear();
    lineRequestIds.current.clear();
    lineVersions.current.clear();
    linesRef.current = [];
    setLines([]);
    setAnswer("");
    setRead(false);
    setUnreadable(false);
    setConfidence("high");
    setPreview(null);
    setReadingRows(new Set());
    setPageReading(false);
    setChecking(false);
    setStatus(null);
    clearVerdict();
  }, [clearVerdict]);

  const resetProblem = useCallback(({ resetConfiguration = true } = {}) => {
    cancelSession();
    if (resetConfiguration) {
      const defaultTopic = TOPICS[0];
      const defaultType = defaultTopic.types[0];
      setTopicId(defaultTopic.id);
      setTypeId(defaultType.id);
      setValues(emptyValues(defaultType));
    }
    setStatus(null);
    setCaptureNote("");
    questionRowRef.current = null;
    setQuestionRow(null);
    setDismissedRows(new Set());
    clearAnswer();
  }, [cancelSession, clearAnswer]);

  const chooseTopic = useCallback(
    (nextTopicId) => {
      const nextTopic = TOPICS.find((entry) => entry.id === nextTopicId);
      if (!nextTopic || nextTopicId === topicId) return;
      setTopicId(nextTopicId);
      setTypeId(nextTopic.types[0].id);
      setValues(emptyValues(nextTopic.types[0]));
      resetProblem({ resetConfiguration: false });
    },
    [resetProblem, topicId]
  );

  const chooseType = useCallback(
    (nextTypeId) => {
      const nextType = topic.types.find((entry) => entry.id === nextTypeId);
      if (!nextType || nextTypeId === typeId) return;
      setTypeId(nextTypeId);
      setValues(emptyValues(nextType));
      resetProblem({ resetConfiguration: false });
    },
    [resetProblem, topic.types, typeId]
  );

  const setValue = useCallback(
    (name, value) => {
      setValues((current) => ({ ...current, [name]: value }));
      // The server-side vault belongs to the exact problem that was opened.
      cancelSession();
      clearVerdict();
    },
    [cancelSession, clearVerdict]
  );

  // -- the question, written rather than typed ------------------------------

  const questionField = questionFieldFor(topic, problemType);

  // Offer the first readable row as the question while the topic still has
  // none. A question written on the page is the natural first thing a student
  // does, and requiring it to be typed puts a seam down the middle of a
  // handwriting app.
  const questionCandidateRow = (() => {
    if (isDrawing || !questionField || ready || questionRow !== null) return null;
    const candidate = orderedChemistryLines(lines).find(
      (line) => line.text.trim() && !line.unreadable && !dismissedRows.has(line.row)
    );
    return candidate?.row ?? null;
  })();

  const useRowAsQuestion = useCallback(
    (row) => {
      const line = linesRef.current.find((entry) => entry.row === row);
      const field = questionFieldFor(topic, problemType);
      const text = line?.text?.trim();
      if (!text || !field) return;
      questionRowRef.current = row;
      setQuestionRow(row);
      // setValue drops the session, so the vault is rebuilt from this
      // question rather than a stale one. That matters for more than
      // accuracy: the vault is what redaction and the terminal-step gate
      // are guarding.
      setValue(field, text);
    },
    [problemType, setValue, topic]
  );

  const dismissQuestionCandidate = useCallback((row) => {
    setDismissedRows((current) => {
      const next = new Set(current);
      next.add(row);
      return next;
    });
  }, []);

  const releaseQuestionRow = useCallback(() => {
    const field = questionFieldFor(topic, problemType);
    questionRowRef.current = null;
    setQuestionRow(null);
    if (field) setValue(field, "");
  }, [problemType, setValue, topic]);

  // -- reading ------------------------------------------------------------

  const readWork = useCallback(
    async (strokes) => {
      if (!isDrawing || !strokes?.length) return;
      const id = ++requestId.current;
      const requestPageId = pageScopeRef.current;
      checkAbortRef.current?.abort();
      const abortController = new AbortController();
      checkAbortRef.current = abortController;
      setPageReading(true);
      setStatus(null);
      setVerdict(null);
      setVerdictsByLine(new Map());
      setFirstWrongRow(null);
      try {
        const data = await readStructureSnapshot(
          strokes,
          () => id === requestId.current && requestPageId === pageScopeRef.current,
          { signal: abortController.signal }
        );
        if (!data) return;

        setAnswer(data.smiles ?? "");
        setUnreadable(Boolean(data.unreadable));
        setConfidence(data.confidence ?? "high");
        setRead(true);
        setPreview(trustedStructurePreview(data));
      } catch (error) {
        if (id !== requestId.current || requestPageId !== pageScopeRef.current) return;
        if (error.name === "AbortError") return;
        setStatus({ error: error.message });
      } finally {
        if (id === requestId.current) setPageReading(false);
        if (checkAbortRef.current === abortController) checkAbortRef.current = null;
      }
    },
    [isDrawing]
  );

  const readLine = useCallback(
    async ({ row, strokes, onProcessed, pageId: rowPageId }) => {
      if (isDrawing || !strokes?.length) return;
      if (rowPageId !== undefined && rowPageId !== pageScopeRef.current) return;

      const version = lineVersions.current.get(row) ?? 0;
      const request = (lineRequestIds.current.get(row) ?? 0) + 1;
      lineRequestIds.current.set(row, request);
      lineAbortControllers.current.get(row)?.abort();
      const abortController = new AbortController();
      lineAbortControllers.current.set(row, abortController);
      setReadingRows((current) => addReadingRow(current, row));

      try {
        // Let the pointer event that queued the row return before PNG work.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (
          isStaleLineResponse(
            request,
            lineRequestIds.current.get(row),
            version,
            lineVersions.current.get(row) ?? 0
          ) || (rowPageId !== undefined && rowPageId !== pageScopeRef.current)
        ) {
          return;
        }

        const dataUrl = await renderLineToPng([...strokes]);
        if (
          isStaleLineResponse(
            request,
            lineRequestIds.current.get(row),
            version,
            lineVersions.current.get(row) ?? 0
          ) || (rowPageId !== undefined && rowPageId !== pageScopeRef.current)
        ) {
          return;
        }

        const data = await transcribeChemistryText(dataUrl.split(",")[1], {
          signal: abortController.signal,
        });
        if (
          isStaleLineResponse(
            request,
            lineRequestIds.current.get(row),
            version,
            lineVersions.current.get(row) ?? 0
          ) || (rowPageId !== undefined && rowPageId !== pageScopeRef.current)
        ) {
          return;
        }

        const nextLine = {
          row,
          text: data.unreadable ? "" : data.text ?? "",
          unreadable: Boolean(data.unreadable),
          confidence: data.confidence ?? "high",
        };
        const nextLines = upsertChemistryLine(linesRef.current, nextLine);
        linesRef.current = nextLines;
        setLines(nextLines);
        setRead(true);
        setStatus(null);
        onProcessed?.();
      } catch (error) {
        if (
          isStaleLineResponse(
            request,
            lineRequestIds.current.get(row),
            version,
            lineVersions.current.get(row) ?? 0
          )
        ) {
          return;
        }
        if (error.name !== "AbortError") setStatus({ error: error.message });
      } finally {
        setReadingRows((current) => {
          if (lineRequestIds.current.get(row) !== request) return current;
          return removeReadingRow(current, row);
        });
        if (lineAbortControllers.current.get(row) === abortController) {
          lineAbortControllers.current.delete(row);
        }
      }
    },
    [isDrawing]
  );

  // The canvas invokes this after a row has been idle or explicitly finished.
  // Keeping the snapshot at the boundary prevents a later stroke from
  // changing the image that is already being recognized.
  const queueRow = useCallback(
    (rowSnapshot) => {
      void readLine(rowSnapshot);
    },
    [readLine]
  );

  const invalidateLine = useCallback(
    (row) => {
      lineVersions.current.set(row, (lineVersions.current.get(row) ?? 0) + 1);
      lineRequestIds.current.set(row, (lineRequestIds.current.get(row) ?? 0) + 1);
      lineAbortControllers.current.get(row)?.abort();
      lineAbortControllers.current.delete(row);
      requestId.current += 1;
      checkAbortRef.current?.abort();
      setReadingRows((current) => removeReadingRow(current, row));
      setChecking(false);
      const nextLines = removeChemistryLine(linesRef.current, row);
      linesRef.current = nextLines;
      setLines(nextLines);
      setVerdictsByLine((current) => keepVerdictsBeforeRow(current, row));
      setFirstWrongRow(null);
      setVerdict(null);
      setProblemError(null);
      clearHints();
      setStatus(null);
    },
    [clearHints]
  );

  const editLine = useCallback(
    (row, value) => {
      const existing = linesRef.current.find((line) => line.row === row);
      invalidateLine(row);
      const nextLine = {
        row,
        text: value,
        unreadable: false,
        confidence: existing?.confidence ?? "high",
      };
      const nextLines = upsertChemistryLine(linesRef.current, nextLine);
      linesRef.current = nextLines;
      setLines(nextLines);
      setRead(true);
    },
    [invalidateLine]
  );

  // -- preview ------------------------------------------------------------

  const refreshPreview = useCallback(async (smiles) => {
    const id = ++previewRequestId.current;
    const requestPageId = pageScopeRef.current;
    previewAbortRef.current?.abort();
    const abortController = new AbortController();
    previewAbortRef.current = abortController;
    if (!smiles.trim()) {
      setPreview(null);
      previewAbortRef.current = null;
      return;
    }
    try {
      const data = await renderStructure(smiles, { signal: abortController.signal });
      if (id !== previewRequestId.current || requestPageId !== pageScopeRef.current) return;
      setPreview(trustedStructurePreview(data));
    } catch (error) {
      if (id !== previewRequestId.current || requestPageId !== pageScopeRef.current) return;
      if (error.name === "AbortError") return;
      setPreview(null);
    } finally {
      if (previewAbortRef.current === abortController) previewAbortRef.current = null;
    }
  }, []);

  const editAnswer = useCallback(
    (value) => {
      setAnswer(value);
      setUnreadable(unreadable && !value.trim());
      clearVerdict();
      if (isDrawing) refreshPreview(value);
    },
    [clearVerdict, isDrawing, refreshPreview, unreadable]
  );

  // -- checking -----------------------------------------------------------

  const checkAnswer = useCallback(async () => {
    const written = answer.trim();
    // The row holding the question is not a step. Without this the student's
    // own question is checked as though it were their first line of working,
    // and is reported wrong for not being balanced.
    const currentLines = orderedChemistryLines(linesRef.current).filter(
      (line) => line.row !== questionRowRef.current
    );
    const steps = isDrawing
      ? written
        ? [{ line_number: 1, smiles: written }]
        : []
      : buildChemistrySteps(currentLines);

    if (!ready || steps.length === 0) return;

    const id = ++requestId.current;
    const requestPageId = pageScopeRef.current;
    checkAbortRef.current?.abort();
    const abortController = new AbortController();
    checkAbortRef.current = abortController;
    setChecking(true);
    setStatus(null);
    clearHints();

    try {
      const data = await topic.check(problemType, values, steps, {
        signal: abortController.signal,
      });
      if (id !== requestId.current || requestPageId !== pageScopeRef.current) return;

      if (data.problem_error) {
        setVerdict(null);
        setProblemError(data.problem_error);
        return;
      }

      setProblemError(null);
      if (isDrawing) {
        setVerdict(data.verdicts[0] ?? null);
        setVerdictsByLine(new Map());
        setFirstWrongRow(null);
      } else {
        const nextVerdicts = mapChemistryVerdicts(data.verdicts, currentLines);
        setVerdict(null);
        setVerdictsByLine(nextVerdicts);
        setFirstWrongRow(
          data.first_wrong_line > 0
            ? rowForChemistryLineNumber(currentLines, data.first_wrong_line)
            : null
        );
      }

      // Only solve for the hint vault after an invalid verdict exists.
      const hasInvalid = data.verdicts.some(
        (item) => item.status === "invalid"
      );
      if (hasInvalid) ensureSession();
    } catch (error) {
      if (id !== requestId.current || requestPageId !== pageScopeRef.current) return;
      if (error.name === "AbortError") return;
      setVerdict(null);
      setVerdictsByLine(new Map());
      setFirstWrongRow(null);
      setStatus({ error: `Check failed: ${error.message}` });
    } finally {
      if (id === requestId.current) setChecking(false);
      if (checkAbortRef.current === abortController) checkAbortRef.current = null;
    }
  }, [answer, clearHints, ensureSession, isDrawing, problemType, ready, topic, values]);

  // Written chemistry checks itself, the way math has since the beginning.
  //
  // A student who has finished a line should not have to reach for a button to
  // find out whether it holds: the line is read automatically, so it is judged
  // automatically, and the row goes green or red on the page. `checkAnswer`
  // through a ref so this fires on new transcription rather than every time
  // an unrelated dependency of the callback changes.
  //
  // Held back while a row is still being read, so a page mid-transcription is
  // not judged on the lines that happen to have landed first. `reading` going
  // false is itself a trigger, so the check still runs the moment the last row
  // is in.
  const checkAnswerRef = useRef(checkAnswer);
  useEffect(() => {
    checkAnswerRef.current = checkAnswer;
  }, [checkAnswer]);

  useEffect(() => {
    if (isDrawing || !ready || reading) return undefined;
    if (orderedChemistryLines(lines).length === 0) return undefined;
    const timer = setTimeout(() => checkAnswerRef.current?.(), 250);
    return () => clearTimeout(timer);
  }, [isDrawing, lines, ready, reading]);

  // -- hints --------------------------------------------------------------

  const requestHint = useCallback(async () => {
    if (hintLevel >= 3) return;

    const stepLines = chemistryStepLines(linesRef.current, questionRowRef.current);
    const lineIndex = stepLines.findIndex((line) => line.row === firstWrongRow);
    const activeVerdict = isDrawing
      ? verdict
      : verdictsByLine.get(firstWrongRow);
    if (!activeVerdict || lineIndex === -1 && !isDrawing) return;

    const nextLevel = hintLevel + 1;
    const id = ++hintRequestId.current;
    const requestPageId = pageScopeRef.current;
    hintAbortRef.current?.abort();
    const abortController = new AbortController();
    hintAbortRef.current = abortController;
    setHintLoading(true);
    setHintError(null);

    const active = await ensureSession();
    if (id !== hintRequestId.current || requestPageId !== pageScopeRef.current) return;

    try {
      const data = await getHint({
        line_number: isDrawing ? 1 : lineIndex + 1,
        error_type: activeVerdict.error_type ?? null,
        level: nextLevel,
        subject: "chemistry",
        topic: topicId,
        session_id: active?.session_id ?? null,
        problem: problemText,
        student_line: isDrawing
          ? answer || null
          : stepLines[lineIndex]?.text || null,
      }, { signal: abortController.signal });
      if (id !== hintRequestId.current || requestPageId !== pageScopeRef.current) return;
      setHintLevel(data.level);
      setHint(data);
    } catch (error) {
      if (id !== hintRequestId.current || requestPageId !== pageScopeRef.current) return;
      if (error.name === "AbortError") return;
      setHintError(error.message);
    } finally {
      if (id === hintRequestId.current) setHintLoading(false);
      if (hintAbortRef.current === abortController) hintAbortRef.current = null;
    }
  }, [answer, ensureSession, firstWrongRow, hintLevel, isDrawing, problemText, topicId, verdict, verdictsByLine]);

  const cancelHint = useCallback(() => {
    hintRequestId.current += 1;
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    setHintLoading(false);
  }, []);

  // -- corpus capture -----------------------------------------------------

  const capture = useCallback(
    async (imageBase64, groundTruth) => {
      try {
        const data = await captureSample({
          image_base64: imageBase64,
          topic:
            problemType.id === "functional_group"
              ? "functional_group"
              : isDrawing
              ? "structure"
              : "balance",
          ground_truth: groundTruth,
          target:
            values.target_smiles ||
            values.target_group ||
            values.reference_equation ||
            groundTruth,
          note: captureNote,
        });
        setCaptureCount(data.total_samples);
        setStatus({
          notice: `Saved ${data.saved_as} (${data.total_samples} so far)`,
        });
        setCaptureNote("");
      } catch (error) {
        setStatus({ error: `Capture failed: ${error.message}` });
      }
    },
    [captureNote, isDrawing, problemType.id, values]
  );

  const getWorkflowSnapshot = useCallback(() => {
    return serializeWorkflowSnapshot({
      subject: "chemistry",
      mode: "chemistry",
      chemistry: { topicId, typeId, values },
      problemText,
      problemFingerprint: workflowProblemFingerprint({
        subject: "chemistry",
        problemText,
        chemistry: { topicId, typeId, values },
      }),
      answer,
      read,
      unreadable,
      confidence,
      recognizedLines: linesRef.current,
      questionRow: questionRowRef.current,
      verdictsByLine,
      wholePageVerdict: verdict,
      firstWrongRow,
      dismissedRows,
      hintLevel,
      hint,
      reading,
      checking,
      lastResult: status,
      updatedAt: Date.now(),
    });
  }, [answer, checking, confidence, dismissedRows, firstWrongRow, hint, hintLevel, problemText, read, reading, status, topicId, typeId, unreadable, values, verdict, verdictsByLine]);

  const restoreWorkflowSnapshot = useCallback((rawSnapshot) => {
    const snapshot = deserializeWorkflowSnapshot(rawSnapshot);
    if (!snapshot || snapshot.subject !== "chemistry") {
      resetProblem();
      return;
    }
    cancelSession();
    clearAnswer();
    const nextTopicId = snapshot.chemistry?.topicId ?? TOPICS[0].id;
    const nextTopic = TOPICS.find((entry) => entry.id === nextTopicId) ?? TOPICS[0];
    const nextTypeId = snapshot.chemistry?.typeId ?? nextTopic.types[0].id;
    const nextType = nextTopic.types.find((entry) => entry.id === nextTypeId) ?? nextTopic.types[0];
    setTopicId(nextTopic.id);
    setTypeId(nextType.id);
    setValues({ ...emptyValues(nextType), ...(snapshot.chemistry?.values ?? {}) });
    const nextLines = [...(snapshot.recognizedLines ?? [])];
    linesRef.current = nextLines;
    setLines(nextLines);
    questionRowRef.current = snapshot.questionRow ?? null;
    setQuestionRow(questionRowRef.current);
    setDismissedRows(snapshot.dismissedRows ?? new Set());
    setAnswer(snapshot.answer ?? "");
    setRead(Boolean(snapshot.read || snapshot.answer));
    setUnreadable(Boolean(snapshot.unreadable));
    setConfidence(snapshot.confidence ?? "high");
    setPreview(null);
    setVerdict(snapshot.wholePageVerdict ?? null);
    setVerdictsByLine(snapshot.verdictsByLine ?? new Map());
    setFirstWrongRow(snapshot.firstWrongRow ?? null);
    setProblemError(null);
    setHintLevel(snapshot.hintLevel ?? 0);
    setHint(snapshot.hint ?? null);
    setHintError(null);
    setStatus(snapshot.lastResult ?? null);
  }, [cancelSession, clearAnswer, resetProblem]);

  useEffect(() => {
    pageScopeRef.current = pageId;
    // A page identity change is an intentional state reset; App immediately
    // restores the destination page's snapshot after this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetProblem();
  }, [pageId, resetProblem]);

  useEffect(() => () => {
    checkAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    previewAbortRef.current?.abort();
    for (const controller of lineAbortControllers.current.values()) controller.abort();
  }, []);

  return {
    topic,
    topicId,
    chooseTopic,
    problemType,
    chooseType,
    values,
    setValue,
    inputMode,
    isDrawing,
    ready,
    problemText,
    answer,
    editAnswer,
    lines,
    editLine,
    questionField,
    questionRow,
    questionCandidateRow,
    useRowAsQuestion,
    dismissQuestionCandidate,
    releaseQuestionRow,
    read,
    unreadable,
    confidence,
    preview,
    reading,
    readWork,
    queueRow,
    invalidateLine,
    verdict,
    verdictsByLine,
    firstWrongRow,
    problemError,
    checking,
    checkAnswer,
    hintLevel,
    hint,
    hintError,
    hintLoading,
    requestHint,
    cancelHint,
    session,
    status,
    setStatus,
    resetProblem,
    clearAnswer,
    invalidateRequests,
    captureNote,
    setCaptureNote,
    capture,
    captureCount,
    getWorkflowSnapshot,
    restoreWorkflowSnapshot,
  };
}
