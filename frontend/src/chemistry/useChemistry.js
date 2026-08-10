import { useCallback, useRef, useState } from "react";

import { renderLineToPng } from "../canvas/render";
import {
  captureSample,
  getHint,
  openSession,
  renderStructure,
  transcribeChemistryText,
  transcribeStructure,
} from "../api";
import {
  buildChemistrySteps,
  isStaleLineResponse,
  isWholePageChemistryInput,
  keepVerdictsBeforeRow,
  mapChemistryVerdicts,
  orderedChemistryLines,
  removeChemistryLine,
  rowForChemistryLineNumber,
  upsertChemistryLine,
} from "./lineModel";
import { trustedStructurePreview } from "./structurePreview";
import { TOPICS, describeProblem, inputModeFor, isProblemReady } from "./topics";

const emptyValues = (type) =>
  Object.fromEntries(
    type.fields.map((field) => [
      field.name,
      field.type === "select" ? field.options[0] : "",
    ])
  );

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

export default function useChemistry() {
  const [topicId, setTopicId] = useState("structure");
  const topic = TOPICS.find((entry) => entry.id === topicId) ?? TOPICS[0];
  const [typeId, setTypeId] = useState(topic.types[0].id);
  const problemType =
    topic.types.find((entry) => entry.id === typeId) ?? topic.types[0];
  const [values, setValues] = useState(() => emptyValues(topic.types[0]));

  const [session, setSession] = useState(null);

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
  const [hintLoading, setHintLoading] = useState(false);

  const [status, setStatus] = useState(null); // { error } | { notice }
  const [captureNote, setCaptureNote] = useState("");
  const [captureCount, setCaptureCount] = useState(null);

  const requestId = useRef(0);
  const hintRequestId = useRef(0);
  const lineRequestIds = useRef(new Map());
  const lineVersions = useRef(new Map());

  const inputMode = inputModeFor(topic, problemType);
  const isDrawing = isWholePageChemistryInput(inputMode);
  const ready = isProblemReady(problemType, values);
  const problemText = describeProblem(topic, problemType, values);
  const reading = pageReading || readingRows.size > 0;

  // -- invalidation -------------------------------------------------------

  const invalidateRequests = useCallback(() => {
    requestId.current += 1;
    hintRequestId.current += 1;
  }, []);

  const clearHints = useCallback(() => {
    hintRequestId.current += 1;
    setHintLevel(0);
    setHint(null);
    setHintLoading(false);
  }, []);

  const clearVerdict = useCallback(() => {
    requestId.current += 1;
    setVerdict(null);
    setVerdictsByLine(new Map());
    setFirstWrongRow(null);
    setProblemError(null);
    clearHints();
  }, [clearHints]);

  const clearAnswer = useCallback(() => {
    requestId.current += 1;
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
    clearVerdict();
  }, [clearVerdict]);

  const resetProblem = useCallback(() => {
    setSession(null);
    setStatus(null);
    setCaptureNote("");
    clearAnswer();
  }, [clearAnswer]);

  const chooseTopic = useCallback(
    (nextTopicId) => {
      const nextTopic = TOPICS.find((entry) => entry.id === nextTopicId);
      if (!nextTopic || nextTopicId === topicId) return;
      setTopicId(nextTopicId);
      setTypeId(nextTopic.types[0].id);
      setValues(emptyValues(nextTopic.types[0]));
      resetProblem();
    },
    [resetProblem, topicId]
  );

  const chooseType = useCallback(
    (nextTypeId) => {
      const nextType = topic.types.find((entry) => entry.id === nextTypeId);
      if (!nextType || nextTypeId === typeId) return;
      setTypeId(nextTypeId);
      setValues(emptyValues(nextType));
      resetProblem();
    },
    [resetProblem, topic.types, typeId]
  );

  const setValue = useCallback(
    (name, value) => {
      setValues((current) => ({ ...current, [name]: value }));
      // The server-side vault belongs to the exact problem that was opened.
      setSession(null);
      clearVerdict();
    },
    [clearVerdict]
  );

  // -- session ------------------------------------------------------------

  const ensureSession = useCallback(async () => {
    if (session) return session;
    const payload = topic.session?.(problemType, values, problemText);
    if (!payload) return null;
    try {
      const created = await openSession(payload);
      setSession(created);
      return created;
    } catch {
      setStatus({
        notice:
          "We couldn't solve this problem ahead of time, so hints will be the " +
          "built-in ones rather than written for your work.",
      });
      return null;
    }
  }, [problemText, problemType, session, topic, values]);

  // -- reading ------------------------------------------------------------

  const readWork = useCallback(
    async (imageBase64) => {
      if (!isDrawing) return;
      const id = ++requestId.current;
      setPageReading(true);
      setStatus(null);
      setVerdict(null);
      setVerdictsByLine(new Map());
      setFirstWrongRow(null);
      try {
        const data = await transcribeStructure(imageBase64);
        if (id !== requestId.current) return;

        setAnswer(data.smiles ?? "");
        setUnreadable(Boolean(data.unreadable));
        setConfidence(data.confidence ?? "high");
        setRead(true);
        setPreview(trustedStructurePreview(data));
      } catch (error) {
        if (id !== requestId.current) return;
        setStatus({ error: error.message });
      } finally {
        if (id === requestId.current) setPageReading(false);
      }
    },
    [isDrawing]
  );

  const readLine = useCallback(
    async ({ row, strokes }) => {
      if (isDrawing || !strokes?.length) return;

      const version = lineVersions.current.get(row) ?? 0;
      const request = (lineRequestIds.current.get(row) ?? 0) + 1;
      lineRequestIds.current.set(row, request);
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
          )
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
          )
        ) {
          return;
        }

        const data = await transcribeChemistryText(dataUrl.split(",")[1]);
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
        setStatus({ error: error.message });
      } finally {
        setReadingRows((current) => {
          if (lineRequestIds.current.get(row) !== request) return current;
          return removeReadingRow(current, row);
        });
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
      requestId.current += 1;
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
    if (!smiles.trim()) {
      setPreview(null);
      return;
    }
    try {
      const data = await renderStructure(smiles);
      setPreview(trustedStructurePreview(data));
    } catch {
      setPreview(null);
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
    const currentLines = orderedChemistryLines(linesRef.current);
    const steps = isDrawing
      ? written
        ? [{ line_number: 1, smiles: written }]
        : []
      : buildChemistrySteps(currentLines);

    if (!ready || steps.length === 0) return;

    const id = ++requestId.current;
    setChecking(true);
    setStatus(null);
    clearHints();

    try {
      const data = await topic.check(problemType, values, steps);
      if (id !== requestId.current) return;

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
      if (id !== requestId.current) return;
      setVerdict(null);
      setVerdictsByLine(new Map());
      setFirstWrongRow(null);
      setStatus({ error: `Check failed: ${error.message}` });
    } finally {
      if (id === requestId.current) setChecking(false);
    }
  }, [answer, clearHints, ensureSession, isDrawing, problemType, ready, topic, values]);

  // -- hints --------------------------------------------------------------

  const requestHint = useCallback(async () => {
    if (hintLevel >= 3) return;

    const currentLines = orderedChemistryLines(linesRef.current);
    const lineIndex = currentLines.findIndex((line) => line.row === firstWrongRow);
    const activeVerdict = isDrawing
      ? verdict
      : verdictsByLine.get(firstWrongRow);
    if (!activeVerdict || lineIndex === -1 && !isDrawing) return;

    const nextLevel = hintLevel + 1;
    const id = ++hintRequestId.current;
    setHintLoading(true);

    const active = await ensureSession();
    if (id !== hintRequestId.current) return;

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
          : currentLines[lineIndex]?.text || null,
      });
      if (id !== hintRequestId.current) return;
      setHintLevel(data.level);
      setHint(data);
    } catch (error) {
      if (id !== hintRequestId.current) return;
      setHint({
        level: nextLevel,
        hint: `We couldn't fetch that hint: ${error.message}`,
        source: "fallback",
      });
      setHintLevel(nextLevel);
    } finally {
      if (id === hintRequestId.current) setHintLoading(false);
    }
  }, [answer, ensureSession, firstWrongRow, hintLevel, isDrawing, problemText, topicId, verdict, verdictsByLine]);

  const cancelHint = useCallback(() => {
    hintRequestId.current += 1;
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
  };
}
