import { useEffect, useMemo, useRef, useState } from "react";

import {
  HANDWRITING_EXPERIMENT_EXPORT_SCHEMA,
} from "../recognition/handwritingExperienceReport";
import {
  resolveHandwritingExperienceExperiment,
} from "../recognition/handwritingExperienceExperiment";
import { RECOGNITION_METRIC_EVENT } from "../recognition/recognitionMetrics";

const TASKS = Object.freeze([
  ["linear-01", "3x + 2 = 5"],
  ["linear-02", "3x = 3"],
  ["linear-03", "x = 1"],
  ["linear-04", "2(x - 3) = 10"],
  ["linear-05", "2x - 6 = 10"],
  ["linear-06", "2x = 16"],
  ["linear-07", "x = 8"],
  ["linear-08", "4 - x = 9"],
  ["linear-09", "-x = 5"],
  ["linear-10", "x = -5"],
  ["linear-11", "0.5x + 1 = 3"],
  ["linear-12", "x/2 + 3 = 7"],
].map(([id, prompt]) => Object.freeze({ id, prompt })));

const EMPTY_ASSESSMENT = Object.freeze({
  responsiveness: 3,
  confidence: 3,
  accuracy: "",
  corrections: 0,
  flickerOrIncomplete: 0,
});

function browserClass(userAgent = globalThis.navigator?.userAgent ?? "") {
  if (/Firefox/i.test(userAgent)) return "firefox";
  if (/Edg/i.test(userAgent)) return "edge";
  if (/Chrome|Chromium/i.test(userAgent)) return "chromium";
  if (/Safari/i.test(userAgent)) return "safari";
  return "other";
}

function deviceClass() {
  const touch = (globalThis.navigator?.maxTouchPoints ?? 0) > 0;
  const width = globalThis.innerWidth ?? 0;
  const size = width < 600 ? "small" : width < 1_100 ? "medium" : "large";
  return `${touch ? "touch" : "pointer"}-${size}`;
}

function downloadJson(payload, filename) {
  const url = URL.createObjectURL(new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  ));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const fieldStyle = { display: "grid", gap: 3, fontSize: 12 };

export default function HandwritingExperiencePanel() {
  const experiment = useMemo(
    () => resolveHandwritingExperienceExperiment(),
    []
  );
  const [taskIndex, setTaskIndex] = useState(0);
  const [assessment, setAssessment] = useState({ ...EMPTY_ASSESSMENT });
  const [assessments, setAssessments] = useState([]);
  const metricsRef = useRef([]);
  const taskIdRef = useRef(TASKS[0].id);

  useEffect(() => {
    taskIdRef.current = TASKS[taskIndex].id;
  }, [taskIndex]);

  useEffect(() => {
    if (!experiment.enabled) return undefined;
    const capture = (event) => {
      metricsRef.current.push({
        taskId: taskIdRef.current,
        ...event.detail,
      });
    };
    globalThis.addEventListener(RECOGNITION_METRIC_EVENT, capture);
    return () => globalThis.removeEventListener(RECOGNITION_METRIC_EVENT, capture);
  }, [experiment.enabled]);

  if (!experiment.enabled) return null;
  const task = TASKS[taskIndex];
  const recordedTaskIds = new Set(assessments.map((entry) => entry.taskId));

  const recordCurrent = () => {
    setAssessments((current) => [
      ...current.filter((entry) => entry.taskId !== task.id),
      { taskId: task.id, ...assessment },
    ]);
  };

  const nextTask = () => {
    recordCurrent();
    if (taskIndex < TASKS.length - 1) {
      setTaskIndex((index) => index + 1);
      setAssessment({ ...EMPTY_ASSESSMENT });
    }
  };

  const exportRun = () => {
    const exportedAt = new Date().toISOString();
    downloadJson({
      schemaVersion: HANDWRITING_EXPERIMENT_EXPORT_SCHEMA,
      experiment: experiment.name,
      variant: experiment.variant,
      exportedAt,
      policy: {
        recognizer: "gemini",
        quietPeriodMs: experiment.quietPeriodMs,
        maxRecognitionConcurrency: experiment.maxRecognitionConcurrency,
      },
      environment: {
        browserClass: browserClass(),
        deviceClass: deviceClass(),
      },
      assessments,
      metrics: metricsRef.current,
    }, `verity-hwr-${experiment.variant}-${Date.now()}.json`);
  };

  return (
    <details
      open
      style={{
        position: "fixed",
        zIndex: 40,
        top: 76,
        right: 16,
        width: 310,
        maxHeight: "calc(100vh - 96px)",
        overflow: "auto",
        padding: 12,
        border: "1px solid #9aa7a3",
        borderRadius: 10,
        background: "rgba(252, 253, 248, 0.97)",
        boxShadow: "0 8px 24px rgba(20, 35, 30, 0.18)",
        color: "#1f2926",
        userSelect: "text",
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        Internal handwriting A/B — {experiment.variant}
      </summary>
      <p style={{ fontSize: 12, lineHeight: 1.4 }}>
        Write the expression exactly, wait for recognition, then rate this task.
        Use New Question before moving on. No ink or recognized text is exported.
      </p>
      <div style={{ fontSize: 12, color: "#51605b" }}>
        Task {taskIndex + 1}/{TASKS.length} · {recordedTaskIds.size} saved
      </div>
      <div style={{ margin: "8px 0 12px", fontSize: 22, fontWeight: 700 }}>
        {task.prompt}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <label style={fieldStyle}>
          Perceived responsiveness (1 slow–5 instant)
          <input
            type="range"
            min="1"
            max="5"
            value={assessment.responsiveness}
            onChange={(event) => setAssessment((value) => ({
              ...value,
              responsiveness: Number(event.target.value),
            }))}
          />
        </label>
        <label style={fieldStyle}>
          Recognition
          <select
            value={assessment.accuracy}
            onChange={(event) => setAssessment((value) => ({
              ...value,
              accuracy: event.target.value,
            }))}
          >
            <option value="" disabled>Choose after recognition</option>
            <option value="correct">Exact/harmless formatting only</option>
            <option value="incorrect">Incorrect transcription</option>
            <option value="unreadable">Reported unreadable</option>
          </select>
        </label>
        <label style={fieldStyle}>
          Confidence in rating (1–5)
          <input
            type="number"
            min="1"
            max="5"
            value={assessment.confidence}
            onChange={(event) => setAssessment((value) => ({
              ...value,
              confidence: Number(event.target.value),
            }))}
          />
        </label>
        <label style={fieldStyle}>
          Corrections needed
          <input
            type="number"
            min="0"
            value={assessment.corrections}
            onChange={(event) => setAssessment((value) => ({
              ...value,
              corrections: Math.max(0, Number(event.target.value)),
            }))}
          />
        </label>
        <label style={fieldStyle}>
          Flicker/incomplete transcriptions noticed
          <input
            type="number"
            min="0"
            value={assessment.flickerOrIncomplete}
            onChange={(event) => setAssessment((value) => ({
              ...value,
              flickerOrIncomplete: Math.max(0, Number(event.target.value)),
            }))}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={nextTask} disabled={!assessment.accuracy}>
          {taskIndex === TASKS.length - 1 ? "Save task" : "Save & next"}
        </button>
        <button
          type="button"
          onClick={exportRun}
          disabled={recordedTaskIds.size !== TASKS.length}
        >
          Export JSON
        </button>
      </div>
    </details>
  );
}
