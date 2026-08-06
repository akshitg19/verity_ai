import { useCallback, useRef, useState } from "react";

import {
  captureSample,
  getHint,
  openSession,
  renderStructure,
  transcribeChemistryText,
  transcribeStructure,
} from "../api";
import { TOPICS, describeProblem, inputModeFor, isProblemReady } from "./topics";

// All chemistry state in one place, so App.jsx's toolbar and the chemistry
// panel read from the same source instead of each keeping their own copy.
//
// The shape mirrors how a student actually works: pick a problem, write or
// draw an answer, have it read back, check it, then climb the hint ladder.
// Every one of those steps invalidates the ones after it, which is the bulk
// of what this hook does.

const emptyValues = (type) =>
  Object.fromEntries(
    type.fields.map((field) => [
      field.name,
      field.type === "select" ? field.options[0] : "",
    ])
  );

export default function useChemistry() {
  const [topicId, setTopicId] = useState("structure");
  const topic = TOPICS.find((entry) => entry.id === topicId) ?? TOPICS[0];
  const [typeId, setTypeId] = useState(topic.types[0].id);
  const problemType =
    topic.types.find((entry) => entry.id === typeId) ?? topic.types[0];
  const [values, setValues] = useState(() => emptyValues(topic.types[0]));

  const [session, setSession] = useState(null);

  const [answer, setAnswer] = useState("");
  const [read, setRead] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const [confidence, setConfidence] = useState("high");
  const [preview, setPreview] = useState(null); // { svg, formula, generic }
  const [reading, setReading] = useState(false);

  const [verdict, setVerdict] = useState(null);
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

  const inputMode = inputModeFor(topic, problemType);
  const ready = isProblemReady(problemType, values);
  const problemText = describeProblem(topic, problemType, values);

  // -- invalidation ---------------------------------------------------------

  // Ref-only invalidation, no setState. Called on pen-down, where PR #11
  // established that the ink path must stay pure: bumping a request id is
  // free, while a React update on every stroke start is not. The matching
  // state invalidation happens in clearAnswer when the stroke commits.
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
    setProblemError(null);
    clearHints();
  }, [clearHints]);

  const clearAnswer = useCallback(() => {
    setAnswer("");
    setRead(false);
    setUnreadable(false);
    setConfidence("high");
    setPreview(null);
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
      // Changing the problem invalidates the session: the vault it holds was
      // solved for the old one, and redacting against a stale answer is
      // worse than not redacting at all.
      setSession(null);
      clearVerdict();
    },
    [clearVerdict]
  );

  // -- session --------------------------------------------------------------

  const ensureSession = useCallback(async () => {
    if (session) return session;
    const payload = topic.session?.(problemType, values, problemText);
    if (!payload) return null;
    try {
      const created = await openSession(payload);
      setSession(created);
      return created;
    } catch {
      // A problem we cannot solve gets no vault, so hints fall back to the
      // built-in ladder. Worth saying out loud rather than failing silently.
      setStatus({
        notice:
          "We couldn't solve this problem ahead of time, so hints will be the " +
          "built-in ones rather than written for your work.",
      });
      return null;
    }
  }, [problemText, problemType, session, topic, values]);

  // -- reading the page -----------------------------------------------------

  const readWork = useCallback(
    async (imageBase64) => {
      const id = ++requestId.current;
      setReading(true);
      setStatus(null);
      setVerdict(null);
      try {
        const isDrawing = inputMode === "drawing";
        const data = isDrawing
          ? await transcribeStructure(imageBase64)
          : await transcribeChemistryText(imageBase64);
        if (id !== requestId.current) return;

        setAnswer(isDrawing ? data.smiles : data.text);
        setUnreadable(data.unreadable);
        setConfidence(data.confidence ?? "high");
        setRead(true);
        setPreview(
          isDrawing && data.svg
            ? { svg: data.svg, formula: null, generic: data.generic }
            : null
        );
      } catch (error) {
        if (id !== requestId.current) return;
        setStatus({ error: error.message });
      } finally {
        if (id === requestId.current) setReading(false);
      }
    },
    [inputMode]
  );

  // Re-render the picture whenever the student corrects the SMILES by hand,
  // so the drawing they are checking is always the one that will be judged.
  const refreshPreview = useCallback(async (smiles) => {
    if (!smiles.trim()) {
      setPreview(null);
      return;
    }
    try {
      const data = await renderStructure(smiles);
      setPreview({ svg: data.svg, formula: data.formula, generic: data.generic });
    } catch {
      setPreview(null);
    }
  }, []);

  const editAnswer = useCallback(
    (value) => {
      setAnswer(value);
      setUnreadable(unreadable && !value.trim());
      clearVerdict();
      if (inputMode === "drawing") refreshPreview(value);
    },
    [clearVerdict, inputMode, refreshPreview, unreadable]
  );

  // -- checking -------------------------------------------------------------

  const checkAnswer = useCallback(async () => {
    const written = answer.trim();
    if (!written || !ready) return;

    const id = ++requestId.current;
    setChecking(true);
    setStatus(null);
    clearHints();

    try {
      const data = await topic.check(problemType, values, [
        { line_number: 1, smiles: written },
      ]);
      if (id !== requestId.current) return;

      if (data.problem_error) {
        setVerdict(null);
        setProblemError(data.problem_error);
        return;
      }
      setProblemError(null);
      setVerdict(data.verdicts[0] ?? null);
      // Only open a session once there is something to hint about. It costs
      // a solve, and most checks are correct and never need one.
      if (data.verdicts[0] && data.verdicts[0].status === "invalid") {
        ensureSession();
      }
    } catch (error) {
      if (id !== requestId.current) return;
      setVerdict(null);
      setStatus({ error: `Check failed: ${error.message}` });
    } finally {
      if (id === requestId.current) setChecking(false);
    }
  }, [answer, clearHints, ensureSession, problemType, ready, topic, values]);

  // -- hints ----------------------------------------------------------------

  const requestHint = useCallback(async () => {
    if (hintLevel >= 3) return;
    const nextLevel = hintLevel + 1;
    const id = ++hintRequestId.current;
    setHintLoading(true);

    const active = await ensureSession();
    if (id !== hintRequestId.current) return;

    try {
      const data = await getHint({
        line_number: 1,
        error_type: verdict?.error_type ?? null,
        level: nextLevel,
        subject: "chemistry",
        topic: topicId,
        session_id: active?.session_id ?? null,
        problem: problemText,
        student_line: answer || null,
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
  }, [answer, ensureSession, hintLevel, problemText, topicId, verdict]);

  const cancelHint = useCallback(() => {
    hintRequestId.current += 1;
    setHintLoading(false);
  }, []);

  // -- corpus capture -------------------------------------------------------

  const capture = useCallback(
    async (imageBase64, groundTruth) => {
      try {
        const data = await captureSample({
          image_base64: imageBase64,
          topic:
            problemType.id === "functional_group"
              ? "functional_group"
              : inputMode === "drawing"
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
        setStatus({ notice: `Saved ${data.saved_as} (${data.total_samples} so far)` });
        setCaptureNote("");
      } catch (error) {
        setStatus({ error: `Capture failed: ${error.message}` });
      }
    },
    [captureNote, inputMode, problemType.id, values]
  );

  return {
    // problem
    topic,
    topicId,
    chooseTopic,
    problemType,
    chooseType,
    values,
    setValue,
    inputMode,
    ready,
    problemText,
    // answer
    answer,
    editAnswer,
    read,
    unreadable,
    confidence,
    preview,
    reading,
    readWork,
    // verdict
    verdict,
    problemError,
    checking,
    checkAnswer,
    // hints
    hintLevel,
    hint,
    hintLoading,
    requestHint,
    cancelHint,
    session,
    // misc
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
