import { useEffect, useRef } from "react";

import HintLadder from "../components/HintLadder";
import VerdictCard from "../components/VerdictCard";
import { COLORS, FONT, RADIUS, SUBJECTS } from "../theme";
import StructurePreviewCard from "./StructurePreviewCard";
import WrittenChemistrySteps from "./WrittenChemistrySteps";
import { TOPICS } from "./topics";

// The chemistry side of the feedback panel.
//
// Everything the backend can judge is reachable from here: six topics, and
// under each the problem types that map onto real endpoints. The old panel
// could only ask "is this the exact molecule I'm thinking of", which is one
// of eleven questions the backend can now answer.

const accent = SUBJECTS.chemistry.accent;

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.7,
        textTransform: "uppercase",
        color: COLORS.muted,
        margin: "14px 0 6px",
      }}
    >
      {children}
    </div>
  );
}

function TopicPicker({ topicId, onChoose }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 6,
      }}
    >
      {TOPICS.map((topic) => {
        const selected = topic.id === topicId;
        return (
          <button
            key={topic.id}
            type="button"
            title={topic.blurb}
            aria-pressed={selected}
            onClick={() => onChoose(topic.id)}
            style={{
              padding: "9px 6px",
              borderRadius: RADIUS.md,
              border: `1px solid ${selected ? accent : COLORS.border}`,
              background: selected ? SUBJECTS.chemistry.accentLight : COLORS.surface,
              color: selected ? accent : COLORS.muted,
              fontSize: 10.5,
              fontWeight: selected ? 700 : 500,
              lineHeight: 1.25,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 15 }}>{topic.glyph}</span>
            {topic.label}
          </button>
        );
      })}
    </div>
  );
}

function ProblemFields({ problemType, values, setValue }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {problemType.fields.map((field) => (
        <label key={field.name} style={{ display: "block" }}>
          <div
            style={{
              fontSize: 11,
              color: COLORS.muted,
              marginBottom: 3,
              fontWeight: 600,
            }}
          >
            {field.label}
          </div>
          {field.type === "select" ? (
            <select
              value={values[field.name] ?? field.options[0]}
              onChange={(event) => setValue(field.name, event.target.value)}
              style={inputStyle}
            >
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={values[field.name] ?? ""}
              placeholder={field.placeholder}
              onChange={(event) => setValue(field.name, event.target.value)}
              style={{
                ...inputStyle,
                fontFamily: /smiles|equation|formula|composition|amounts/i.test(
                  field.label + field.name
                )
                  ? FONT.mono
                  : FONT.sans,
              }}
            />
          )}
        </label>
      ))}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.sm,
  background: COLORS.surface,
  color: COLORS.text,
  fontSize: 13,
  outline: "none",
};

export default function ChemistryPanel({
  chemistry,
  captureEnabled,
  onCapture,
}) {
  const {
    topic,
    topicId,
    chooseTopic,
    problemType,
    chooseType,
    values,
    setValue,
    inputMode,
    ready,
    answer,
    answerUnit,
    editAnswer,
    lines,
    editLine,
    questionRows,
    releaseQuestionRow,
    read,
    unreadable,
    confidence,
    preview,
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
    captureNote,
    setCaptureNote,
    worksheet,
  } = chemistry;

  const answerRef = useRef(null);

  // Low confidence means the reading is a coin flip, so put the cursor where
  // the student can fix it before they ever see a verdict.
  useEffect(() => {
    if (
      inputMode === "drawing" &&
      read &&
      (confidence === "low" || unreadable) &&
      answerRef.current
    ) {
      answerRef.current.focus();
      answerRef.current.select();
    }
  }, [confidence, inputMode, read, unreadable]);

  const canCheck = inputMode === "drawing" && Boolean(answer.trim()) && ready && !checking;
  const showHints =
    inputMode === "drawing"
      ? verdict?.status === "invalid"
      : firstWrongRow !== null && verdictsByLine.get(firstWrongRow)?.status === "invalid";
  const handleTopicChange = (nextTopicId) => {
    if (nextTopicId === topicId) return;
    chooseTopic(nextTopicId);
  };
  const handleTypeChange = (nextTypeId) => {
    if (nextTypeId === problemType.id) return;
    chooseType(nextTypeId);
  };

  return (
    <div>
      {/* The blurb under the picker said in a sentence what the picker
          already says in a word, and the "Subject" label above it named the
          thing the icons make obvious. Both gone. */}
      <TopicPicker topicId={topicId} onChoose={handleTopicChange} />

      <SectionLabel>Question</SectionLabel>
      <select
        aria-label="Chemistry question type"
        value={problemType.id}
        onChange={(event) => handleTypeChange(event.target.value)}
        style={{ ...inputStyle, marginBottom: 8, fontWeight: 600 }}
      >
        {topic.types.map((type) => (
          <option key={type.id} value={type.id}>
            {type.label}
          </option>
        ))}
      </select>
      <ProblemFields
        problemType={problemType}
        values={values}
        setValue={setValue}
      />

      {problemError && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: RADIUS.md,
            background: "var(--v-unsupported-bg)",
            border: "1px solid var(--v-unsupported-border)",
            color: "var(--v-unsupported)",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {problemError === "unsupported"
            ? "That problem is outside what we can check yet. That's our limit, not a mistake in your work."
            : "We couldn't read that problem. Check the formula or equation above."}
        </div>
      )}

      <SectionLabel>
        {inputMode === "drawing" ? "Your structure" : "Your answer"}
      </SectionLabel>

      {inputMode !== "drawing" ? (
        lines.length === 0 ? (
          <div
            style={{
              minHeight: 130,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 18,
              boxSizing: "border-box",
              borderRadius: RADIUS.lg,
              background: COLORS.background,
              border: `1px dashed ${COLORS.border}`,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                display: "grid",
                placeItems: "center",
                marginBottom: 10,
                borderRadius: "50%",
                background: SUBJECTS.chemistry.accentLight,
                color: accent,
                fontSize: 19,
              }}
            >
              {topic.glyph}
            </div>
            <div style={{ marginBottom: 4, color: COLORS.text, fontSize: 14, fontWeight: 700 }}>
              {worksheet ? "Work on the page" : "Write one row at a time"}
            </div>
            <div style={{ maxWidth: 220, color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}>
              {worksheet
                ? "Fill in the boxes, work however you like, and write your answer in the answer box."
                : "Each row is read and checked on its own."}
            </div>
          </div>
        ) : (
          <WrittenChemistrySteps
            lines={lines}
            verdictsByLine={verdictsByLine}
            inputMode={inputMode}
            ready={ready}
            checking={checking}
            questionRows={questionRows}
            worksheet={worksheet}
            onEdit={editLine}
            onCheck={checkAnswer}
            onReleaseQuestion={releaseQuestionRow}
          />
        )
      ) : !read && !answer ? (
        <div
          style={{
            minHeight: 130,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 18,
            boxSizing: "border-box",
            borderRadius: RADIUS.lg,
            background: COLORS.background,
            border: `1px dashed ${COLORS.border}`,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              display: "grid",
              placeItems: "center",
              marginBottom: 10,
              borderRadius: "50%",
              background: SUBJECTS.chemistry.accentLight,
              color: accent,
              fontSize: 19,
            }}
          >
            {topic.glyph}
          </div>
          <div
            style={{
              marginBottom: 5,
              color: COLORS.text,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {inputMode === "drawing" ? "Draw it on the page" : "Write it on the page"}
          </div>
          <div
            style={{ maxWidth: 240, color: COLORS.muted, fontSize: 12, lineHeight: 1.5 }}
          >
            {inputMode === "drawing"
              ? "Use the whole page for one structure, then press Read Page. R groups are fine. Draw R, R', or Ar."
              : "Write one row, then press Read Page. You can also type it below."}
          </div>
        </div>
      ) : (
        <VerdictCard
          title={inputMode === "drawing" ? "Structure" : "Answer"}
          verdict={verdict}
          waitingDetail={
            unreadable
              ? "We couldn't read that confidently. Correct it below before checking."
              : confidence === "low"
              ? "We're not sure we read this correctly, so check it before we judge it."
              : "Ready to check."
          }
          onConfirm={checkAnswer}
        >
          {/* The unit sits beside the box, not inside it.
            *
            * A student writing a molar mass should type `98.08` and nothing
            * else: `g/mol` is a property of the question, which we already
            * know, not of their answer. Making them write it is asking for
            * information we have, and it is one more thing to get wrong on a
            * tablet keyboard.
            *
            * It also closes a real hole from the front. `judge/quantities.py`
            * reads a unit off the written line, and solutions.md finding 3
            * records that units are optional and ignored everywhere, so
            * `0.25`, `0.250 M` and `0.250 mol/L` all pass. Supplying the unit
            * ourselves beats tightening a parser against handwriting.
            *
            * Null for a formula, a species, or a pH, which have no unit and
            * where printing one would be wrong. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              ref={answerRef}
              aria-label="Chemistry answer transcription"
              type="text"
              value={answer}
              placeholder={problemType.answerPlaceholder ?? topic.answerPlaceholder}
              onChange={(event) => editAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                  checkAnswer();
                }
              }}
              style={{
                ...inputStyle,
                flex: 1,
                minWidth: 0,
                fontFamily: inputMode === "numeric" ? FONT.sans : FONT.mono,
                borderColor: confidence === "low" ? "var(--v-unsupported)" : COLORS.border,
              }}
            />
            {answerUnit && (
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  color: COLORS.muted,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: FONT.sans,
                }}
              >
                {answerUnit}
              </span>
            )}
          </div>

          <StructurePreviewCard preview={preview} />

          <button
            type="button"
            onClick={checkAnswer}
            disabled={!canCheck}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "9px 14px",
              background: canCheck ? accent : "var(--v-waiting-bg)",
              color: "#fff",
              border: "none",
              borderRadius: RADIUS.sm,
              fontWeight: 700,
              fontSize: 13,
              cursor: canCheck ? "pointer" : "not-allowed",
            }}
          >
            {checking
              ? "Checking…"
              : !ready
              ? "Fill in the question above first"
              : "Check it"}
          </button>
        </VerdictCard>
      )}

      {showHints && (
        <HintLadder
          level={hintLevel}
          hint={hint?.hint}
          workedExample={hint?.worked_example}
          terminalStep={hint?.terminal_step}
          source={hint?.source}
          resource={hint?.resource}
          error={hintError}
          loading={hintLoading}
          onRequest={requestHint}
          onCancel={cancelHint}
        />
      )}

      {captureEnabled && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: `1px dashed ${COLORS.border}`,
          }}
        >
          <SectionLabel>Corpus capture</SectionLabel>
          <div
            style={{
              fontSize: 11.5,
              color: COLORS.muted,
              lineHeight: 1.45,
              marginBottom: 6,
            }}
          >
            Type what you actually drew, then save it. Ground truth has to come
            from you, not from what the model read back.
          </div>
          <input
            aria-label="Corpus capture note"
            type="text"
            value={captureNote}
            placeholder="note, e.g. skeletal, crowded ring, fast handwriting"
            onChange={(event) => setCaptureNote(event.target.value)}
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <button
            type="button"
            onClick={onCapture}
            style={{
              width: "100%",
              padding: "8px 14px",
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface,
              color: COLORS.text,
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Capture sample
          </button>
        </div>
      )}
    </div>
  );
}
