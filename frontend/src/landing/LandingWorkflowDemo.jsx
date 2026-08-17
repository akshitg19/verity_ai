import { useEffect, useState } from "react";
import { WALKTHROUGHS } from "./landingWalkthroughData";

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
  const [subject, setSubject] = useState("math");
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || prefersReducedMotion()) return undefined;
    const timer = window.setInterval(
      () => setStage((current) => (current + 1) % 3),
      2400,
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  const walkthrough = WALKTHROUGHS[subject];
  const [stageLabel, status, source] = walkthrough.stages[stage];

  return (
    <aside
      className={`landing-demo landing-demo--${subject}`}
      aria-label="Interactive Math and Chemistry feedback walkthrough"
    >
      <div className="landing-demo__header">
        <div>
          <span className="landing-demo__eyebrow">{walkthrough.eyebrow}</span>
          <strong>{walkthrough.title}</strong>
        </div>
        <span className="landing-demo__live"><i aria-hidden="true" />Recorded</span>
      </div>

      <div className="landing-demo__subjects" role="group" aria-label="Walkthrough subject">
        {Object.entries(WALKTHROUGHS).map(([id, item]) => (
          <button
            key={id}
            type="button"
            aria-pressed={subject === id}
            onClick={() => {
              setSubject(id);
              setStage(0);
              setPlaying(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="landing-demo__stages" role="group" aria-label="Walkthrough stage">
        {walkthrough.stages.map(([label], index) => (
          <button
            key={label}
            type="button"
            aria-pressed={stage === index}
            onClick={() => {
              setStage(index);
              setPlaying(false);
            }}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <div className={`landing-demo__paper landing-demo__paper--stage-${stage + 1}`}>
        <div className="landing-demo__prompt">{walkthrough.prompt}</div>
        {walkthrough.lines.map((line, index) => {
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
          <strong><span className="sr-only">{stageLabel}: </span>{status}</strong>
          <span>{source}</span>
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
