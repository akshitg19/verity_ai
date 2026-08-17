import { useEffect, useState } from "react";

import { LADDER } from "./landingContent";

// The hint ladder, drawn as a ladder.
//
// The point the section has to make in one look: each rung is a different
// *kind* of help, not the same help worded more generously, and the ladder
// stops before the answer. A list of three paragraphs did not carry that, so
// this climbs: rungs fill in as you go up, the rung you are on shows what it
// would actually say, and the top of the ladder is a rail that is deliberately
// not a fourth rung.

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function HintLadder() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || prefersReducedMotion()) return undefined;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % LADDER.length),
      3400,
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  const current = LADDER[active];

  return (
    <div className="hint-ladder">
      <div className="hint-ladder__rungs" role="tablist" aria-label="Hint levels">
        <span className="hint-ladder__rail hint-ladder__rail--left" aria-hidden="true" />
        <span className="hint-ladder__rail hint-ladder__rail--right" aria-hidden="true" />

        <div className="hint-ladder__stop" aria-hidden="true">
          <span>The answer</span>
          <em>never handed over</em>
        </div>

        {/* Top down, so level 1 is the bottom rung and the climb reads
            upwards. A rung is "reached" once the climb has got that high. */}
        {[...LADDER].reverse().map((rung) => {
          const reached = active >= rung.level - 1;
          return (
            <button
              key={rung.level}
              type="button"
              role="tab"
              aria-selected={current.level === rung.level}
              className={`hint-ladder__rung${reached ? " is-reached" : ""}${current.level === rung.level ? " is-active" : ""}`}
              onClick={() => {
                setActive(rung.level - 1);
                setPlaying(false);
              }}
            >
              <span className="hint-ladder__level">{rung.level}</span>
              <span className="hint-ladder__name">
                {rung.name}
                <em>{rung.ask}</em>
              </span>
            </button>
          );
        })}
      </div>

      <div className="hint-ladder__detail" aria-live="polite">
        <span className="hint-ladder__badge">Level {current.level}</span>
        <h3>{current.name}</h3>
        <p>{current.body}</p>
        <blockquote>{current.example}</blockquote>
        <button
          type="button"
          className="hint-ladder__toggle"
          onClick={() => setPlaying((currentPlaying) => !currentPlaying)}
        >
          {playing ? "Pause" : "Play"}
        </button>
      </div>
    </div>
  );
}
