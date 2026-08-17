import { useEffect, useState } from "react";

const STAGES = [
  {
    label: "Write",
    status: "Pen input · complete one line",
    source: "Ink stays responsive",
  },
  {
    label: "Recognize",
    status: "MyScript Beta · Vector · 272 ms rehearsal",
    source: "Transcription only",
  },
  {
    label: "Verify",
    status: "SymPy verdict · first break: line 3",
    source: "Reasoning stays deterministic",
  },
];

const LINES = ["2x + 3 = 11", "2x = 8", "x = 5"];

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function lineState(stage, index) {
  if (stage === 0) return index === 0 ? "active" : "pending";
  if (stage === 1) {
    if (index === 0) return "complete";
    return index === 1 ? "active" : "pending";
  }
  return index < 2 ? "complete" : "review";
}

export default function LandingWorkflowDemo() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || prefersReducedMotion()) return undefined;
    const timer = window.setInterval(
      () => setStage((current) => (current + 1) % STAGES.length),
      2400,
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  const current = STAGES[stage];

  return (
    <aside className="landing-demo" aria-label="Interactive Algebra feedback walkthrough">
      <div className="landing-demo__header">
        <div>
          <span className="landing-demo__eyebrow">Algebra walkthrough</span>
          <strong>Follow one line from ink to feedback</strong>
        </div>
        <span className="landing-demo__live"><i aria-hidden="true" />Recorded</span>
      </div>

      <div className="landing-demo__stages" role="group" aria-label="Walkthrough stage">
        {STAGES.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={stage === index}
            onClick={() => {
              setStage(index);
              setPlaying(false);
            }}
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className={`landing-demo__paper landing-demo__paper--stage-${stage + 1}`}>
        <div className="landing-demo__prompt">Solve for x</div>
        {LINES.map((line, index) => {
          const state = lineState(stage, index);
          return (
            <div className={`landing-demo__line landing-demo__line--${state}`} key={line}>
              <span className="landing-demo__line-number">{index + 1}</span>
              <span className="landing-demo__equation">{line}</span>
              <span className="landing-demo__verdict" aria-hidden="true">
                {state === "complete" ? "✓" : state === "review" ? "!" : state === "active" ? "•••" : ""}
              </span>
            </div>
          );
        })}
        <span className="landing-demo__pen" aria-hidden="true" />
      </div>

      <div className="landing-demo__footer">
        <div aria-live="polite">
          <strong>{current.status}</strong>
          <span>{current.source}</span>
        </div>
        <button
          type="button"
          className="landing-demo__toggle"
          aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
          onClick={() => setPlaying((currentPlaying) => !currentPlaying)}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>
    </aside>
  );
}
