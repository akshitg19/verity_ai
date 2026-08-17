import { useEffect, useRef, useState } from "react";
import { STORY_SCENES } from "./landingStoryData";

export default function LandingProductStory() {
  const [activeScene, setActiveScene] = useState(0);
  const sceneRefs = useRef([]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return undefined;
    const observer = new window.IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible) setActiveScene(Number(visible.target.dataset.sceneIndex));
      },
      { rootMargin: "-30% 0px -42% 0px", threshold: [0, 0.25, 0.55] },
    );
    sceneRefs.current.forEach((scene) => scene && observer.observe(scene));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-story">
      <div className="landing-story__intro">
        <span>One notebook, two kinds of reasoning</span>
        <h2>See the product change with the problem.</h2>
        <p>Scroll through the real Math and Chemistry workspaces.</p>
      </div>

      <div className="landing-story__layout">
        <div className="landing-story__steps">
          {STORY_SCENES.map((scene, index) => (
            <article
              className={`landing-story__step${activeScene === index ? " is-active" : ""}`}
              data-scene-index={index}
              key={scene.id}
              ref={(element) => { sceneRefs.current[index] = element; }}
              onMouseEnter={() => setActiveScene(index)}
            >
              <span>{scene.eyebrow}</span>
              <h3>{scene.title}</h3>
              <p>{scene.copy}</p>
              <strong>{scene.status}</strong>
              <div className={`landing-story__mobile-visual landing-story__mobile-visual--${scene.id}`}>
                <img src={scene.image} alt={scene.alt} />
              </div>
            </article>
          ))}
        </div>

        <div className="landing-story__visual" aria-hidden="true">
          <div className="landing-story__frame">
            {STORY_SCENES.map((scene, index) => (
              <div
                className={`landing-story__scene landing-story__scene--${scene.id}${activeScene === index ? " is-active" : ""}`}
                key={scene.id}
              >
                <img src={scene.image} alt="" />
                <div className="landing-story__scene-label">
                  <span>{scene.eyebrow}</span>
                  <strong>{scene.status}</strong>
                </div>
              </div>
            ))}
          </div>
          <div className="landing-story__dots">
            {STORY_SCENES.map((scene, index) => (
              <span className={activeScene === index ? "is-active" : ""} key={scene.id} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
