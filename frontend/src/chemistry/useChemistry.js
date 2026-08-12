import { useCallback, useEffect, useRef, useState } from "react";

import { getStrokeRow } from "../canvas/geometry";
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
  questionVerbFor,
  answerUnitFor,
} from "./topics";
import {
  KINDS,
  ZONES,
  buildWorksheet,
  growWorkingRows,
  isDrawingRow,
  isReadableRow,
  promptAtRow,
  zoneAtRow,
} from "./worksheet";


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
  // Mirrored so useRowAsQuestion can read the current values without being
  // rebuilt on every keystroke in the correction fields. Written in an
  // effect rather than during render, which React forbids.
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

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
  // Several rows can make up one question, so this is a list. Percent yield
  // takes four written lines; molar mass takes one.
  const [questionRows, setQuestionRows] = useState([]);
  const questionRowsRef = useRef([]);
  const [dismissedRows, setDismissedRows] = useState(() => new Set());

  // -- the worksheet ------------------------------------------------------

  // Which rows currently carry ink. The canvas reports this per row as it is
  // written and as it is erased, which is what lets the working box grow
  // under the pen rather than a moment later, when a row settles.
  const [inkRows, setInkRows] = useState(() => new Set());

  const inputMode = inputModeFor(topic, problemType);
  const isDrawing = isWholePageChemistryInput(inputMode);

  // Built twice on purpose: once to know where the working zone is, then
  // again with the row count that zone has grown to. Cheap, pure, and it
  // keeps `growWorkingRows` from needing to know its own answer in advance.
  const baseWorksheet = buildWorksheet(topic, problemType, { inputMode });
  const worksheet = baseWorksheet
    ? buildWorksheet(topic, problemType, {
        inputMode,
        workingRows: growWorkingRows(baseWorksheet, {
          inkRows: [...inkRows],
          answerFilled: Boolean(
            lines
              .find((line) => line.row === baseWorksheet.answerRow)
              ?.text?.trim()
          ),
        }),
      })
    : null;
  const worksheetRef = useRef(worksheet);
  useEffect(() => {
    worksheetRef.current = worksheet;
  });

  // The molecule the question is about, drawn as a picture.
  //
  // "Name this structure" and "draw an isomer of this" both hand the student
  // a molecule, and the only field holding it is a SMILES, which a student
  // has never heard of and must never be shown as the question. RDKit
  // already draws it, so the page shows the drawing and the SMILES stays in
  // the panel as the teacher's field.
  const targetPrompt =
    worksheet?.prompts.find((prompt) => prompt.secret) ?? null;
  const targetSmiles = targetPrompt ? values[targetPrompt.key] ?? "" : "";
  const [targetPicture, setTargetPicture] = useState(null);
  const targetRequestId = useRef(0);
  useEffect(() => {
    const smiles = targetSmiles.trim();
    const id = ++targetRequestId.current;
    const controller = new AbortController();
    // Resolved rather than returned early, so the clear and the render take
    // the same path out of the effect and neither sets state synchronously.
    Promise.resolve(
      smiles ? renderStructure(smiles, { signal: controller.signal }) : null
    )
      .then((data) => {
        if (id !== targetRequestId.current) return;
        setTargetPicture(data ? trustedStructurePreview(data) : null);
      })
      .catch(() => {
        if (id === targetRequestId.current) setTargetPicture(null);
      });
    return () => controller.abort();
  }, [targetSmiles]);

  const answerLine = worksheet
    ? lines.find((line) => line.row === worksheet.answerRow) ?? null
    : null;
  const answerText = answerLine?.text ?? "";

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
    setInkRows(new Set());
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
    questionRowsRef.current = [];
    setQuestionRows([]);
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

  // The field a written row would fill next, and the verb to offer for it.
  // Values are passed in so a multi-field type offers whichever field is
  // still empty rather than always the first: a student writes the equation
  // on one line and the amounts on the next.
  const questionField = questionFieldFor(topic, problemType, values);
  const questionVerb = questionVerbFor(topic, problemType, values);

  // Offer the first readable row that has not already been consumed or waved
  // away, while any ink field is still empty. Writing the question on the page
  // is the natural first thing a student does, and requiring it to be typed
  // puts a seam down the middle of a handwriting app.
  const questionCandidateRow = (() => {
    // A worksheet has labelled boxes, so there is nothing to guess and
    // nothing to offer. The popover exists for topics without one.
    if (worksheet) return null;
    if (isDrawing || !questionField) return null;
    const candidate = orderedChemistryLines(lines).find(
      (line) =>
        line.text.trim() &&
        !line.unreadable &&
        !dismissedRows.has(line.row) &&
        !questionRows.includes(line.row)
    );
    return candidate?.row ?? null;
  })();

  const useRowAsQuestion = useCallback(
    (row) => {
      const line = linesRef.current.find((entry) => entry.row === row);
      const field = questionFieldFor(topic, problemType, valuesRef.current);
      const text = line?.text?.trim();
      if (!text || !field) return;
      const nextRows = questionRowsRef.current.includes(row)
        ? questionRowsRef.current
        : [...questionRowsRef.current, row];
      questionRowsRef.current = nextRows;
      setQuestionRows(nextRows);
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
    questionRowsRef.current = [];
    setQuestionRows([]);
    if (field) setValue(field, "");
  }, [problemType, setValue, topic]);

  // -- reading ------------------------------------------------------------

  const readWork = useCallback(
    async (allStrokes) => {
      // The question boxes are above the drawing area, and their ink is a
      // formula written as text. Sending it inside the figure would hand the
      // structure recogniser a picture with a caption in it.
      const sheet = worksheetRef.current;
      const strokes =
        sheet?.kind === KINDS.DRAW
          ? (allStrokes ?? []).filter((stroke) =>
              isDrawingRow(sheet, getStrokeRow(stroke))
            )
          : allStrokes;
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
      // A drawing page still has question boxes at the top, and those are
      // handwriting to be read as text, not part of the figure. Everything
      // else on a drawing page goes through `readWork` as one image.
      const isPrompt = Boolean(promptAtRow(worksheetRef.current, row));
      if ((isDrawing && !isPrompt) || !strokes?.length) return;
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

        // A prompt box fills its own field. There is no popover to tap and
        // nothing to guess at: the box the student wrote in says which field
        // this is. `setValue` drops the session, so the vault is rebuilt from
        // the corrected question rather than a stale one.
        const prompt = promptAtRow(worksheetRef.current, row);
        if (prompt && nextLine.text.trim()) setValue(prompt.key, nextLine.text.trim());

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
    [isDrawing, setValue]
  );

  // The canvas invokes this after a row has been idle or explicitly finished.
  // Keeping the snapshot at the boundary prevents a later stroke from
  // changing the image that is already being recognized.
  const queueRow = useCallback(
    (rowSnapshot) => {
      // The working is never read. Not a shortcut and not a cost saving: a
      // page of arithmetic laid out however the student likes is exactly
      // what recognition is worst at, and a wrong verdict on correct
      // scribble is the failure this product cannot afford.
      const active = worksheetRef.current;
      if (active && !isReadableRow(active, rowSnapshot?.row)) return;
      void readLine(rowSnapshot);
    },
    [readLine]
  );

  const invalidateLine = useCallback(
    (row, hasInk = true) => {
      setInkRows((current) => {
        if (hasInk === current.has(row)) return current;
        const next = new Set(current);
        if (hasInk) next.add(row);
        else next.delete(row);
        return next;
      });
      // Working rows hold no transcription and no verdict, so there is
      // nothing to tear down and no reason to drop the answer's verdict
      // every time the student writes another line of arithmetic.
      const active = worksheetRef.current;
      if (active && zoneAtRow(active, row) === ZONES.WORKING) return;
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
    const active = worksheetRef.current;
    // Which lines are the student's claims depends on the shape of the page.
    //
    // On an ANSWER page it is the answer box alone: the working above it is
    // their own arrangement of the arithmetic and is never sent. On a STEPS
    // page every working row is a step and all of them go, which is what
    // balancing and net ionic already do and what their hints depend on.
    const currentLines = !active
      ? orderedChemistryLines(linesRef.current).filter(
          (line) => !questionRowsRef.current.includes(line.row)
        )
      : active.kind === KINDS.ANSWER
      ? linesRef.current.filter(
          (line) => line.row === active.answerRow && line.text.trim()
        )
      : orderedChemistryLines(linesRef.current).filter(
          (line) => zoneAtRow(active, line.row) === ZONES.WORKING
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
        // Knowing which line is the answer is what lets the judge reject an
        // intermediate written in the answer box. Without it a student who
        // stops at the mass of one element is told they are correct, which
        // is the standing "nothing marks a line as the final answer"
        // finding in final_tasks.md.
        answersOnly: active?.kind === KINDS.ANSWER,
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

    // A worksheet has exactly one judged line, so the hint layer is told
    // line 1 and handed the answer box. The working never leaves the page.
    // The hint layer is told which of the judged lines went wrong, so this
    // has to be the same list `checkAnswer` sent, in the same order.
    const sheet = worksheetRef.current;
    const stepLines = !sheet
      ? chemistryStepLines(linesRef.current, questionRowsRef.current)
      : sheet.kind === KINDS.ANSWER
      ? linesRef.current.filter((line) => line.row === sheet.answerRow)
      : orderedChemistryLines(linesRef.current).filter(
          (line) => zoneAtRow(sheet, line.row) === ZONES.WORKING
        );
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
      questionRows: questionRowsRef.current,
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
    // Older snapshots stored a single row; both shapes restore.
    questionRowsRef.current = snapshot.questionRows
      ?? (snapshot.questionRow === null || snapshot.questionRow === undefined
        ? []
        : [snapshot.questionRow]);
    setQuestionRows(questionRowsRef.current);
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
    questionRows,
    questionVerb,
    worksheet,
    targetPicture,
    answerText,
    answerVerdict:
      worksheet?.answerRow !== null && worksheet
        ? verdictsByLine.get(worksheet.answerRow) ?? null
        : null,
    answerUnit: answerUnitFor(problemType),
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
