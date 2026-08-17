import { useEffect, useState } from "react";

// One walkthrough: a problem on a ruled page, moving through write, read and
// check, with the lines lighting up as the stage advances.
//
// It used to be hard-coded to a single algebra problem and to label its
// middle stage "MyScript Beta · Vector · 272 ms rehearsal", which is a build
// detail from a rehearsal and not something a student or a judge has any use
// for. It takes a `demo` now, so the same component runs the algebra,
// statistics, balancing and organic walkthroughs from `landingContent.js`,
// where every line has been through the real judge.

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Which lines are showing by a given stage. Writing shows the first line
// being written; reading has the earlier lines settled and the next one
// arriving; checking shows every verdict at once, which is the point.
function lineState(demo, stage, index) {
  const last = demo.lines.length - 1;
  if (stage === 0) return index === 0 ? "writing" : "pending";
  if (stage === 1) {
    if (index < last) return "read";
    return index === last ? "writing" : "pending";
  }
  return demo.lines[index].state;
}

export default function LandingWorkflowDemo({ demo, compact = false }) {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || prefersReducedMotion()) return undefined;
    const timer = window.setInterval(
      () => setStage((current) => (current + 1) % demo.stages.length),
      2600,
    );
    return () => window.clearInterval(timer);
  }, [playing, demo.stages.length]);

  const [stageName, headline, note] = demo.stages[stage];

  return (
    <aside
      className={`landing-demo${compact ? " landing-demo--compact" : ""}`}
      aria-label={`${demo.eyebrow} walkthrough`}
    >
      <div className="landing-demo__header">
        <div>
          <span className="landing-demo__eyebrow">{demo.eyebrow}</span>
          <strong>{demo.title}</strong>
        </div>
        <span className={`landing-demo__live landing-demo__live--${demo.subject}`}>
          <i aria-hidden="true" />
          {demo.engine}
        </span>
      </div>

      <div className="landing-demo__stages" role="group" aria-label="Walkthrough stage">
        {demo.stages.map(([name], index) => (
          <button
            key={name}
            type="button"
            aria-pressed={stage === index}
            onClick={() => {
              setStage(index);
              setPlaying(false);
            }}
          >
            <span>{index + 1}</span>
            {name}
          </button>
        ))}
      </div>

      <div className={`landing-demo__paper landing-demo__paper--stage-${stage + 1}`}>
        <div className="landing-demo__prompt">{demo.prompt}</div>
        {demo.lines.map((line, index) => {
          const state = lineState(demo, stage, index);
          return (
            <div
              className={`landing-demo__line landing-demo__line--${state}${demo.drawing ? " landing-demo__line--structure" : ""}`}
              key={line.text}
            >
              <span className="landing-demo__line-number">{index + 1}</span>
              <span className="landing-demo__equation">
                {line.text}
                {line.caption && (
                  <em className="landing-demo__caption">{line.caption}</em>
                )}
              </span>
              <span className="landing-demo__verdict" aria-hidden="true">
                {state === "valid" ? "✓" : state === "invalid" ? "!" : state === "writing" ? "•••" : ""}
              </span>
            </div>
          );
        })}
        <span className="landing-demo__pen" aria-hidden="true" />
      </div>

      <div className="landing-demo__footer">
        <div aria-live="polite">
          <strong>{headline}</strong>
          <span>{note}</span>
        </div>
        <button
          type="button"
          className="landing-demo__toggle"
          aria-label={playing ? `Pause the ${demo.eyebrow} walkthrough` : `Play the ${demo.eyebrow} walkthrough`}
          onClick={() => setPlaying((currentPlaying) => !currentPlaying)}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      <p className="landing-demo__verdict-note">
        <strong aria-hidden="true">{stageName}</strong>
        {demo.verdict}
      </p>
    </aside>
  );
}
